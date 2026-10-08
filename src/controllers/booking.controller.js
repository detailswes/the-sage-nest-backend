const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const prisma = require("../prisma/client");
const { logAudit } = require("../utils/auditLog");
const { normalizeConsentLanguage } = require("../utils/language");
const { getConsentWording, getHealthConsentWording, HEALTH_CONSENT_VERSION } = require("../utils/legalConsentWording");
const { normalizeFiscalCode, isValidItalianFiscalCode } = require("../utils/fiscalCode");
const { getLegalDocLinks } = require("../utils/legalDocLinks");
const { SERVICE_FORMATS, usesExpertAddress, isHomeVisit } = require("../constants/format");
const { practiceAddressLine } = require("../utils/countryName");
const { upsertMarketingConsent, syncMarketingConsentToBrevo } = require("../utils/marketingConsent");
const { createRefundWithFallback } = require("../utils/stripeRefund");
const { PAYOUT_SETTLEMENT_MS } = require("../constants/payouts");
const {
  sendBookingCancellationNotification,
  sendParentCancellationConfirmationEmail,
  sendBookingConfirmationEmail,
  sendNewBookingNotificationEmail,
  sendRescheduleNotificationEmail,
  sendExpertCancelledSessionEmail,
  sendExpertCancellationConfirmationEmail,
  sendImLateNotification,
  sendEventFullyBookedEmail,
} = require("../utils/email");

// Billing details are a per-booking snapshot on BookingConsent (spec v1.7 §8) —
// never read live from the parent's profile. Shared select shape for every
// site that surfaces "invoice to" info to the assigned expert/admin.
const BILLING_SNAPSHOT_SELECT = {
  billing_invoice_holder: true,
  billing_address: true,
  billing_postcode: true,
  billing_town: true,
  billing_province: true,
  billing_country: true,
  billing_fiscal_code: true,
  billing_no_fiscal_code: true,
};

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getExpertIdForUser(userId) {
  const expert = await prisma.expert.findUnique({ where: { user_id: userId } });
  return expert ? expert.id : null;
}

// ─── POST /bookings — parent creates a booking + payment intent ───────────────
//
// Body: { expertId, serviceId, scheduledAt (ISO string), format }
// Returns: { bookingId, clientSecret }
//
const WITHDRAWAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

// Thrown inside the createBooking transaction when an event has no spots
// left — distinguishes "event full" from a generic P2002 slot conflict.
class EventFullError extends Error {}

async function createBooking(req, res) {
  const {
    expertId, serviceId, scheduledAt, format, lockId, tcAccepted, withdrawalAccepted, marketingConsent, language,
    billingInvoiceHolder, billingAddress, billingPostcode, billingTown, billingProvince, billingCountry,
    billingFiscalCode, billingNoFiscalCode, healthConsentGiven,
  } = req.body;

  if (!expertId || !serviceId || !scheduledAt || !format || !lockId) {
    return res
      .status(400)
      .json({
        error:
          "expertId, serviceId, scheduledAt, format, and lockId are required",
      });
  }

  const scheduledDate = new Date(scheduledAt);
  if (isNaN(scheduledDate.getTime())) {
    return res.status(400).json({ error: "Invalid scheduledAt date" });
  }
  if (scheduledDate <= new Date()) {
    return res
      .status(400)
      .json({ error: "Scheduled time must be in the future" });
  }
  if (!SERVICE_FORMATS.includes(format)) {
    return res
      .status(400)
      .json({ error: `format must be one of ${SERVICE_FORMATS.join(", ")}` });
  }

  try {
    // ── Load expert (need stripe_account_id) ────────────────────────────────
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(expertId) },
      include: {
        user: { select: { name: true } },
        business_info: { select: { address_country: true } },
      },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    if (expert.status !== "APPROVED") {
      return res
        .status(400)
        .json({
          error: "This specialist is not currently accepting bookings.",
        });
    }
    if (!expert.stripe_account_id) {
      return res
        .status(400)
        .json({ error: "Expert has not connected their Stripe account yet" });
    }

    // Enforce the expert's minimum-notice window server-side — the slot list
    // already hides these times, but that's client-side only, so a request sent
    // straight to this endpoint must be checked independently.
    const noticeMs = (expert.min_notice_hours ?? 24) * 60 * 60 * 1000;
    if (scheduledDate.getTime() - Date.now() < noticeMs) {
      return res.status(400).json({
        error: "This slot is inside the expert's minimum notice window. Please choose a later time.",
      });
    }

    // ── Load service ────────────────────────────────────────────────────────
    const service = await prisma.service.findUnique({
      where: { id: parseInt(serviceId) },
    });
    if (!service || service.expert_id !== expert.id) {
      return res.status(404).json({ error: "Service not found" });
    }
    if (!service.is_active || service.review_status !== "APPROVED") {
      return res
        .status(400)
        .json({ error: "This service is no longer available" });
    }
    // Defense-in-depth, checked a second time right before the PaymentIntent
    // is created below: service currency must match the expert's confirmed
    // Stripe account currency (service.controller.js is the first check, at
    // create/edit time). Guards against a stale or manually altered record
    // slipping through — charging a Connect account in a currency it doesn't
    // settle in either fails at Stripe or triggers silent FX conversion on
    // payout.
    if (service.currency !== expert.currency) {
      console.error(
        `[createBooking] Currency mismatch — service=${service.id} attempted=${service.currency} expected=${expert.currency ?? "(unconfirmed)"} expert=${expert.id}`
      );
      logAudit(req.user.id, "BOOKING_CURRENCY_REJECTED", "SERVICE", service.id,
        `Booking blocked — service currency ${service.currency} does not match expert's confirmed account currency ${expert.currency ?? "(unconfirmed)"}.`);
      return res.status(400).json({
        error: "This service's currency doesn't match the expert's account currency. Please contact support.",
      });
    }

    const isEvent = service.cluster === "EVENT";
    const isFreeBooking = Number(service.price) === 0;

    // Fast pre-check for an obviously-full event — saves the Stripe round
    // trip below. The authoritative check (final race guard) is re-run
    // inside the transaction right before the booking commits.
    if (isEvent) {
      const bookedCount = await prisma.booking.count({
        where: {
          service_id: service.id,
          status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
        },
      });
      if (service.capacity && bookedCount >= service.capacity) {
        return res.status(409).json({ error: "This event is fully booked." });
      }
    }

    // Verify the connected account has card_payments active — required for
    // on_behalf_of (destination charge with expert as Merchant of Record).
    // Irrelevant for a free booking: nothing is ever charged, so a lagging
    // or unconfirmed capability must not block it.
    if (!isFreeBooking) {
      try {
        const stripeAccount = await stripe.v2.core.accounts.retrieve(
          expert.stripe_account_id,
          { include: ["configuration.merchant"] },
        );
        if (stripeAccount.configuration?.merchant?.capabilities?.card_payments?.status !== "active") {
          return res.status(400).json({
            error:
              "This expert's payment account is not fully activated yet. They may need to complete their Stripe onboarding. Please try again later or choose another specialist.",
          });
        }
      } catch (e) {
        console.warn(
          "[createBooking] Could not retrieve Stripe account capabilities:",
          e.message,
        );
        // If Stripe is unreachable, let the PI creation fail naturally with a clear error.
      }
    }

    // ── Verify booking-level consent ─────────────────────────────────────────
    // Every booking is its own contract — a past acceptance (even of the same
    // T&C version) never satisfies this booking. The checkbox must be freshly
    // ticked every time.
    if (tcAccepted !== true) {
      return res
        .status(400)
        .json({
          error:
            "You must accept the Terms & Conditions and Cancellation Policy before proceeding.",
        });
    }

    const [currentTcDoc, currentPpDoc, currentCancellationDoc] = await Promise.all([
      // Events run on their own terms, separate from the 1:1 session T&Cs.
      prisma.legalDocument.findFirst({
        where: { type: isEvent ? "EVENT_TERMS" : "TERMS_CONDITIONS" },
        orderBy: { effective_from: "desc" },
      }),
      prisma.legalDocument.findFirst({
        where: { type: "PRIVACY_POLICY" },
        orderBy: { effective_from: "desc" },
      }),
      prisma.legalDocument.findFirst({
        where: { type: "CANCELLATION_POLICY" },
        orderBy: { effective_from: "desc" },
      }),
    ]);

    // Withdrawal (14-day cooling-off) consent and invoicing only make sense
    // where money actually changes hands — a free booking has nothing to
    // withdraw from and nothing to invoice.
    const withdrawalApplicable =
      !isFreeBooking && scheduledDate.getTime() - Date.now() <= WITHDRAWAL_WINDOW_MS;
    if (withdrawalApplicable && withdrawalAccepted !== true) {
      return res.status(400).json({
        error:
          "You must confirm the early-performance / withdrawal consent before proceeding.",
        withdrawal_required: true,
      });
    }

    // ── Billing details (booking flow spec v1.7 §5.1) ───────────────────────
    // Billing trigger is the EXPERT's country, never the parent's — an Italian
    // expert needs Italian invoice data from every parent, a non-Italian expert
    // needs none of it. Collected fresh every booking, never read from/saved to
    // the parent profile, snapshotted verbatim onto BookingConsent below.
    const isItalianExpert = expert.business_info?.address_country === "it";

    let invoiceHolder = "";
    let normalizedFiscalCode = null;
    if (!isFreeBooking) {
      invoiceHolder = (billingInvoiceHolder || "").trim();
      if (!invoiceHolder) {
        return res.status(400).json({ error: "Invoice holder name is required." });
      }

      if (isItalianExpert) {
        if (!(billingAddress || "").trim() || !(billingPostcode || "").trim() ||
            !(billingTown || "").trim() || !(billingProvince || "").trim()) {
          return res.status(400).json({
            error: "Address, postcode, town, and province are required for this expert's invoicing.",
          });
        }
        if (billingNoFiscalCode !== true) {
          normalizedFiscalCode = normalizeFiscalCode(billingFiscalCode);
          if (!normalizedFiscalCode) {
            return res.status(400).json({ error: "Please enter your fiscal code — it is required on the invoice." });
          }
          if (!isValidItalianFiscalCode(normalizedFiscalCode)) {
            return res.status(400).json({ error: "This does not look like a valid fiscal code. Please check it for a typo." });
          }
        }
      }
    }

    // ── Health-data consent (booking flow spec v1.7 §5.2) ───────────────────
    // Required only when the expert is admin-flagged as a regulated health
    // profession. Flow (A = parent, B = baby) is derived server-side from the
    // service's category tag — never trusted from the client. Any tag other
    // than FOR_BABY (For Parents, Family, Package, Gift, Event) defaults to
    // Flow A.
    const healthConsentRequired = expert.is_health_professional === true;
    const healthConsentFlow = service.cluster === "FOR_BABY" ? "B" : "A";
    if (healthConsentRequired && healthConsentGiven !== true) {
      return res.status(400).json({ error: "Please confirm your consent to continue." });
    }

    // ── Verify slot lock ────────────────────────────────────────────────────
    const now = new Date();
    const lock = await prisma.slotLock.findUnique({
      where: { id: parseInt(lockId) },
    });
    if (
      !lock ||
      lock.parent_id !== req.user.id ||
      lock.expert_id !== expert.id
    ) {
      return res
        .status(400)
        .json({
          error: "Invalid slot reservation. Please select your slot again.",
        });
    }
    if (lock.expires_at <= now) {
      await prisma.slotLock.delete({ where: { id: lock.id } }).catch(() => {});
      return res
        .status(400)
        .json({
          error:
            "Your slot reservation has expired. Please select your slot again.",
        });
    }
    if (lock.slot_start.getTime() !== scheduledDate.getTime()) {
      return res
        .status(400)
        .json({ error: "Slot reservation does not match the selected time." });
    }

    // ── Create booking + release lock atomically ────────────────────────────
    // Both in one transaction: @@unique([expert_id, scheduled_at, parent_id])
    // is the final race-condition guard against this same parent double-
    // booking; the capacity re-check just below is the guard against an
    // event overselling past its last spot. The lock is consumed only once
    // the booking is committed.
    const platformFee = (Number(service.price) * 0.2).toFixed(2);
    const currency = (service.currency || "EUR").toLowerCase();

    const consentLanguage = normalizeConsentLanguage(language);
    const consentWording  = getConsentWording(consentLanguage);
    const healthConsentWording = healthConsentRequired ? getHealthConsentWording(consentLanguage, healthConsentFlow) : null;

    let booking;
    let eventNowFull = false;
    try {
      ({ booking, eventNowFull } = await prisma.$transaction(async (tx) => {
        if (isEvent && service.capacity) {
          const bookedCount = await tx.booking.count({
            where: {
              service_id: service.id,
              status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
            },
          });
          if (bookedCount >= service.capacity) {
            throw new EventFullError();
          }
        }

        const created = await tx.booking.create({
          data: {
            expert_id: expert.id,
            parent_id: req.user.id,
            service_id: service.id,
            scheduled_at: scheduledDate,
            duration_minutes: service.duration_minutes,
            format,
            status: isFreeBooking ? "CONFIRMED" : "PENDING_PAYMENT",
            amount: service.price,
            currency: currency.toUpperCase(),
            platform_fee: platformFee,
            payment_expires_at: isFreeBooking ? null : new Date(now.getTime() + 30 * 60 * 1000),
          },
        });
        await tx.slotLock.delete({ where: { id: lock.id } });

        // This booking may have just taken the event's last spot — stop
        // accepting new ones automatically rather than relying on the expert
        // to notice and deactivate it manually.
        let justFilled = false;
        if (isEvent && service.capacity) {
          const newCount = await tx.booking.count({
            where: {
              service_id: service.id,
              status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
            },
          });
          if (newCount >= service.capacity) {
            await tx.service.update({ where: { id: service.id }, data: { is_active: false } });
            justFilled = true;
          }
        }

        // Durable per-version ledger (still used by admin acceptance counts) —
        // kept alongside, but no longer what gates the checkbox on the frontend.
        if (currentTcDoc) {
          await tx.tcAcceptance.upsert({
            where: {
              user_id_version: { user_id: req.user.id, version: currentTcDoc.version },
            },
            create: { user_id: req.user.id, version: currentTcDoc.version, language: consentLanguage },
            update: {},
          });
        }

        // Full per-booking consent audit trail (spec: booking is its own contract).
        // Wording is snapshotted verbatim (backend-owned copy, not client-submitted)
        // so the record remains proof of what was shown even if the checkout copy
        // changes later.
        await tx.bookingConsent.create({
          data: {
            booking_id: created.id,
            user_id: req.user.id,
            tc_accepted: true,
            tc_version: currentTcDoc?.version ?? "unversioned",
            tc_accepted_at: now,
            terms_wording_snapshot: consentWording.terms,
            cancellation_policy_version: currentCancellationDoc?.version ?? null,
            withdrawal_applicable: withdrawalApplicable,
            withdrawal_accepted: withdrawalApplicable,
            withdrawal_accepted_at: withdrawalApplicable ? now : null,
            withdrawal_wording_snapshot: withdrawalApplicable ? consentWording.withdrawal : null,
            withdrawal_expander_snapshot: withdrawalApplicable ? consentWording.withdrawalExpander : null,
            privacy_policy_version_displayed: currentPpDoc?.version ?? null,
            marketing_consent: marketingConsent === true,
            language: consentLanguage,
            billing_invoice_holder: isFreeBooking ? null : invoiceHolder,
            billing_address: !isFreeBooking && isItalianExpert ? (billingAddress || "").trim() : null,
            billing_postcode: !isFreeBooking && isItalianExpert ? (billingPostcode || "").trim() : null,
            billing_town: !isFreeBooking && isItalianExpert ? (billingTown || "").trim() : null,
            billing_province: !isFreeBooking && isItalianExpert ? (billingProvince || "").trim() : null,
            billing_country: !isFreeBooking && isItalianExpert ? (billingCountry || "").trim() || null : null,
            billing_fiscal_code: normalizedFiscalCode,
            billing_no_fiscal_code: !isFreeBooking && isItalianExpert && billingNoFiscalCode === true,
            health_consent_required: healthConsentRequired,
            health_consent_flow: healthConsentRequired ? healthConsentFlow : null,
            health_consent_given: healthConsentRequired && healthConsentGiven === true,
            health_consent_accepted_at: healthConsentRequired ? now : null,
            health_consent_wording_snapshot: healthConsentWording?.body ?? null,
            health_consent_helper_snapshot: healthConsentWording?.helper ?? null,
            health_consent_version: healthConsentRequired ? HEALTH_CONSENT_VERSION : null,
          },
        });

        // Grant-only: an unchecked box here should never silently withdraw a
        // preference the parent granted elsewhere (registration/settings) —
        // withdrawal is a deliberate action, only done via the settings toggle.
        if (marketingConsent === true) {
          await upsertMarketingConsent(tx, req.user.id, { consent: true, source: "BOOKING" });
        }

        return { booking: created, eventNowFull: justFilled };
      }));
    } catch (err) {
      if (err instanceof EventFullError) {
        return res.status(409).json({ error: "This event is fully booked." });
      }
      if (err.code === "P2002") {
        return res
          .status(409)
          .json({
            error:
              "This time slot is no longer available. Please choose another.",
          });
      }
      throw err;
    }

    if (marketingConsent === true) {
      syncMarketingConsentToBrevo(req.user.id, true);
    }

    // ── Event just filled its last spot ─────────────────────────────────────
    // is_active was already flipped off inside the transaction above — this
    // fires regardless of whether the booking that filled it is free or still
    // waiting on payment, since the capacity count (and therefore is_active)
    // already treats a PENDING_PAYMENT booking as occupying its spot.
    if (eventNowFull) {
      prisma.expert.findUnique({
        where: { id: expert.id },
        select: { timezone: true, user: { select: { email: true, language: true } } },
      }).then((fullExpert) => {
        if (!fullExpert) return;
        const expertLanguage = fullExpert.user.language || "en";
        return sendEventFullyBookedEmail({
          to: fullExpert.user.email,
          expertName: expert.user.name,
          serviceTitle: service.title,
          scheduledAt: scheduledDate,
          timezone: fullExpert.timezone,
          language: expertLanguage,
        });
      }).catch((e) => console.error("[Email] Event-full notification failed:", e.message));
    }

    // ── Free booking: nothing to charge, so there's no PaymentIntent and no
    // webhook to confirm it later — the booking is already CONFIRMED, so send
    // the same notifications the webhook sends for a paid booking, right now.
    if (isFreeBooking) {
      const fullBooking = await prisma.booking.findUnique({
        where: { id: booking.id },
        include: {
          parent: { select: { name: true, email: true, phone: true, language: true, timezone: true, notify_booking_confirmation: true } },
          expert: { select: { address_street: true, address_city: true, address_postcode: true, address_country: true, business_info: { select: { address_country: true } }, timezone: true, notify_new_booking: true, user: { select: { name: true, email: true, language: true } } } },
          service: { select: { title: true } },
          consent: { select: { language: true, withdrawal_applicable: true } },
        },
      });

      const parentConfirmationLanguage = fullBooking.consent?.language || fullBooking.parent.language || "en";
      if (fullBooking.parent.notify_booking_confirmation !== false) {
        const parentExpertAddress = practiceAddressLine(fullBooking.expert, parentConfirmationLanguage);
        getLegalDocLinks(parentConfirmationLanguage).then((legalLinks) => {
          sendBookingConfirmationEmail({
            to: fullBooking.parent.email,
            name: fullBooking.parent.name,
            expertName: fullBooking.expert.user.name,
            serviceTitle: fullBooking.service.title,
            format: fullBooking.format,
            scheduledAt: fullBooking.scheduled_at,
            durationMinutes: fullBooking.duration_minutes,
            location: usesExpertAddress(fullBooking.format) ? (parentExpertAddress || undefined) : undefined,
            language: parentConfirmationLanguage,
            amount: fullBooking.amount,
            currency: fullBooking.currency,
            userTimezone: fullBooking.parent.timezone || fullBooking.expert.timezone,
            withdrawalApplicable: fullBooking.consent?.withdrawal_applicable,
            bookingId: fullBooking.id,
            isEvent,
            ...legalLinks,
          });
        }).catch((e) => console.error("[Email] Free-booking parent confirmation failed:", e.message));
      }

      if (fullBooking.expert.notify_new_booking !== false) {
        const expertLanguage = fullBooking.expert.user.language || "en";
        const notifyExpertAddress = practiceAddressLine(fullBooking.expert, expertLanguage);
        getLegalDocLinks(expertLanguage).then(({ policyUrl }) => {
          sendNewBookingNotificationEmail({
            to: fullBooking.expert.user.email,
            expertName: fullBooking.expert.user.name,
            parentName: fullBooking.parent.name,
            parentEmail: fullBooking.parent.email,
            parentPhone: isHomeVisit(fullBooking.format) ? fullBooking.parent.phone : null,
            serviceTitle: fullBooking.service.title,
            format: fullBooking.format,
            scheduledAt: fullBooking.scheduled_at,
            durationMinutes: fullBooking.duration_minutes,
            location: usesExpertAddress(fullBooking.format) ? (notifyExpertAddress || undefined) : undefined,
            amount: fullBooking.amount,
            currency: fullBooking.currency,
            bookingId: fullBooking.id,
            timezone: fullBooking.expert.timezone,
            language: expertLanguage,
            policyUrl,
            isEvent,
          });
        }).catch((e) => console.error("[Email] Free-booking expert notification failed:", e.message));
      }

      console.log(`[createBooking] Free booking ${booking.id} confirmed — no payment required`);
      return res.status(201).json({
        bookingId: booking.id,
        confirmed: true,
        currency: currency.toUpperCase(),
      });
    }

    // ── Create Stripe PaymentIntent (Destination Charge) ───────────────────
    // on_behalf_of makes the expert the Merchant of Record — the charge appears
    // on their connected account and their statement descriptor is used.
    // application_fee_amount is Sage Nest's 20% platform fee collected at source.
    // transfer_data.destination routes the net amount to the expert's balance
    // immediately; the expert's account is set to manual payouts so those funds
    // stay in their Stripe balance until our processPayouts job releases them
    // 24 hours after the session ends.
    const amountInPence = Math.round(Number(service.price) * 100);
    const applicationFeePence = Math.round(Number(platformFee) * 100);

    console.log(
      `[Payment] Creating PaymentIntent — booking=${booking.id} expert=${expert.id} amount=${amountInPence}p fee=${applicationFeePence}p`,
    );

    let paymentIntent;
    try {
      paymentIntent = await stripe.paymentIntents.create(
        {
          amount: amountInPence,
          currency,
          on_behalf_of: expert.stripe_account_id,
          transfer_data: { destination: expert.stripe_account_id },
          application_fee_amount: applicationFeePence,
          metadata: {
            booking_id: booking.id.toString(),
            expert_id: expert.id.toString(),
            parent_id: req.user.id.toString(),
          },
        },
        { idempotencyKey: `booking-pi-${booking.id}` },
      );
      console.log(
        `[Payment] PaymentIntent created — id=${paymentIntent.id} status=${paymentIntent.status}`,
      );
    } catch (stripeErr) {
      // Clean up the booking if PaymentIntent creation fails
      await prisma.booking
        .delete({ where: { id: booking.id } })
        .catch(() => {});
      console.error(
        "[Payment] Stripe PaymentIntent creation failed:",
        stripeErr.message,
      );
      return res
        .status(500)
        .json({ error: "Could not initiate payment. Please try again." });
    }

    // ── Store the payment intent ID on the booking ──────────────────────────
    await prisma.booking.update({
      where: { id: booking.id },
      data: { stripe_payment_intent_id: paymentIntent.id },
    });

    console.log(
      `[Payment] Booking ${booking.id} ready — clientSecret issued to parent`,
    );

    return res.status(201).json({
      bookingId: booking.id,
      clientSecret: paymentIntent.client_secret,
      currency: currency.toUpperCase(),
      paymentExpiresAt: booking.payment_expires_at,
    });
  } catch (err) {
    console.error("[createBooking] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/:id — get single booking (parent owner or expert owner) ───
async function getBookingById(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: {
          select: { id: true, name: true, email: true },
        },
        expert: {
          include: {
            user: { select: { id: true, name: true, account_deleted: true } },
            business_info: { select: { address_country: true } },
          },
        },
        service: true,
        consent: { select: BILLING_SNAPSHOT_SELECT },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Only allow parent who owns it, or expert who owns it
    const isParent = booking.parent_id === req.user.id;
    const isExpert = booking.expert.user_id === req.user.id;
    if (!isParent && !isExpert) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!isExpert) delete booking.expert_note;
    // Invoicing details are for the assigned expert's invoicing use only —
    // not shown back to the parent in their own view.
    if (!isExpert) delete booking.consent;
    return res.json(booking);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/my — parent's own bookings ─────────────────────────────────
async function getMyBookings(req, res) {
  try {
    const bookings = await prisma.booking.findMany({
      where: { parent_id: req.user.id },
      omit: { expert_note: true },
      orderBy: { scheduled_at: "desc" },
      include: {
        expert: {
          select: {
            profile_image: true,
            address_street: true,
            address_city: true,
            address_postcode: true,
            address_country: true,
            business_info: { select: { address_country: true } },
            user: { select: { name: true, account_deleted: true } },
          },
        },
        service: {
          select: {
            title: true,
            duration_minutes: true,
            is_active: true,
            format: true,
            price: true,
            currency: true,
          },
        },
        late_notifications: {
          where:  { email_status: 'sent' },
          select: { id: true },
          take:   1,
        },
      },
    });
    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── POST /bookings/:id/im-late — parent notifies expert they're running late ─
//
// Rules:
//   • Booking must be CONFIRMED and belong to the requesting parent.
//   • Session must be between 0 and 2 hours away (exclusive upper bound).
//   • If a prior successful notification (email_status='sent') already exists
//     for this booking, a second one cannot be sent — return 409.
//   • Email is the primary channel (always attempted); SMS is secondary
//     (only if expert has a phone and BREVO_SMS_SENDER is configured).
//   • Every attempt is logged in LateNotification regardless of outcome.
//   • If email fails the endpoint returns 502 so the frontend can show a retry.
async function reportImLate(req, res) {
  const bookingId = parseInt(req.params.id, 10);
  const { delay_minutes, note } = req.body;
  const parentId = req.user.id;

  if (![5, 10, 15].includes(delay_minutes)) {
    return res
      .status(400)
      .json({ error: "delay_minutes must be 5, 10, or 15." });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: {
        expert: {
          select: {
            timezone: true,
            user: { select: { email: true, phone: true, name: true, language: true } },
          },
        },
        service: { select: { title: true } },
        parent: { select: { name: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found." });
    if (booking.parent_id !== parentId)
      return res.status(403).json({ error: "Not your booking." });
    if (booking.status !== "CONFIRMED")
      return res.status(400).json({ error: "Booking is not confirmed." });

    const msUntil = new Date(booking.scheduled_at) - Date.now();
    if (msUntil <= 0)
      return res
        .status(400)
        .json({ error: "Session has already started or passed." });
    if (msUntil > 2 * 60 * 60 * 1000)
      return res
        .status(400)
        .json({
          error:
            "Notification is only available within 2 hours of the session.",
        });

    // Idempotency guard — only one successful notification per booking
    const prior = await prisma.lateNotification.findFirst({
      where: { booking_id: bookingId, email_status: "sent" },
    });
    if (prior)
      return res
        .status(409)
        .json({
          error: "A notification has already been sent for this booking.",
        });

    const { emailStatus, smsStatus, emailError, smsError } =
      await sendImLateNotification({
        expertEmail: booking.expert.user.email,
        expertPhone: booking.expert.user.phone,
        expertName: booking.expert.user.name,
        expertTimezone: booking.expert.timezone,
        parentName: booking.parent.name,
        serviceTitle: booking.service.title,
        scheduledAt: booking.scheduled_at,
        delayMinutes: delay_minutes,
        note: note?.trim() || null,
        language: booking.expert.user.language,
      });

    await prisma.lateNotification.create({
      data: {
        booking_id: bookingId,
        parent_id: parentId,
        delay_minutes,
        note: note?.trim() || null,
        email_status: emailStatus,
        sms_status: smsStatus,
        email_error: emailError,
        sms_error: smsError,
      },
    });

    if (emailStatus === "failed") {
      return res
        .status(502)
        .json({ error: "Failed to send notification. Please try again." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[reportImLate] error:", err);
    return res.status(500).json({ error: "Server error." });
  }
}

// ─── DELETE /bookings/:id — parent cancels their booking ─────────────────────
//
// Three-tier cancellation policy — boundary is the request-received timestamp,
// NOT the Stripe processing timestamp:
//
//   ≥ 24 h before session        → full refund  (100%)
//   ≥ 12 h and < 24 h before     → 50% refund
//   < 12 h before session        → no refund    (0%)
//
// Edge-case rules:
//   • Exactly 24 h  → treated as ≥ 24 h  (full refund)
//   • Exactly 12 h  → treated as ≥ 12 h  (50% refund)
//   • No-show       → 0% (< 12 h window; no active cancellation issued by parent)
//   • Expert cancel → always 100% (handled separately via admin controller)
//   • System delay  → cancelledAt is stamped at request arrival, before any
//                     async work, so processing latency never moves a boundary
//
async function cancelBooking(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res
      .status(400)
      .json({ error: "A cancellation reason is required." });
  }

  // Stamp the request-received time immediately — this is the authoritative
  // timestamp used for both the tier calculation and the DB audit field.
  // Any subsequent async work (DB fetch, Stripe call) cannot shift the boundary.
  const cancelledAt = new Date();

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: { select: { name: true, email: true, language: true, timezone: true } },
        expert: { include: { user: { select: { name: true, email: true, language: true } } } },
        service: { select: { id: true, title: true, cluster: true, capacity: true, is_active: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (!["CONFIRMED", "PENDING_PAYMENT"].includes(booking.status)) {
      return res
        .status(400)
        .json({
          error: `Booking cannot be cancelled (current status: ${booking.status})`,
        });
    }

    const hoursUntilSession =
      (booking.scheduled_at.getTime() - cancelledAt.getTime()) /
      (1000 * 60 * 60);
    const wasConfirmed = booking.status === "CONFIRMED";

    // Determine refund tier. Boundaries are inclusive on the more-favourable side:
    //   >= 24 h → 100%, >= 12 h → 50%, < 12 h → 0%
    // min_refund_percent is the worst tier this booking ever reached across all
    // reschedules. Taking the minimum of the two values ensures a reschedule can
    // never improve the tier: if the parent was already in the 50% band when they
    // rescheduled, the floor stays at 50% even if the new slot is far in the future.
    const tierAtCancellation =
      hoursUntilSession >= 24 ? 100 : hoursUntilSession >= 12 ? 50 : 0;
    const refundPercent = Math.min(
      tierAtCancellation,
      booking.min_refund_percent,
    );

    console.log(
      `[cancelBooking] booking=${booking.id} status=${booking.status} hoursUntilSession=${hoursUntilSession.toFixed(4)} refundPercent=${refundPercent}% wasConfirmed=${wasConfirmed} paymentIntentId=${booking.stripe_payment_intent_id} chargeId=${booking.stripe_charge_id}`,
    );

    // ── Cancel the booking ──────────────────────────────────────────────────
    // transfer_status → 'skipped' prevents the transfer cron from paying out
    // a cancelled session even if transfer_due_at has already passed.
    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancellation_reason: reason.trim(),
        cancelled_at: cancelledAt, // request-received time, not now()
        transfer_status: "skipped",
      },
    });
    console.log(`[cancelBooking] booking=${booking.id} marked CANCELLED`);

    // An event auto-deactivates once full (see createBooking) — cancelling an
    // attendee's spot should reopen it for new sign-ups, same as the client
    // asked: "the spot should reopen and spots left should update."
    if (booking.service.cluster === "EVENT" && !booking.service.is_active && booking.service.capacity) {
      const stillBookedCount = await prisma.booking.count({
        where: {
          service_id: booking.service.id,
          status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
        },
      });
      if (stillBookedCount < booking.service.capacity) {
        await prisma.service.update({ where: { id: booking.service.id }, data: { is_active: true } });
      }
    }

    // ── Initiate Stripe refund based on tier ────────────────────────────────
    // Idempotency key: stable per booking + refund tier so a network-timeout
    // retry always returns the same Stripe refund object, never a duplicate.
    let refundInitiated = false;
    if (refundPercent > 0 && wasConfirmed && booking.stripe_payment_intent_id) {
      console.log(
        `[cancelBooking] Initiating ${refundPercent}% refund for booking=${booking.id}`,
      );
      try {
        let chargeId = booking.stripe_charge_id;
        if (!chargeId) {
          console.log(
            `[cancelBooking] No stored chargeId — retrieving from PaymentIntent ${booking.stripe_payment_intent_id}`,
          );
          const pi = await stripe.paymentIntents.retrieve(
            booking.stripe_payment_intent_id,
          );
          chargeId = pi.latest_charge;
          console.log(`[cancelBooking] Retrieved chargeId=${chargeId}`);
        }
        if (chargeId) {
          const refundAmountPence = Math.round(
            (Number(booking.amount) * 100 * refundPercent) / 100,
          );
          const shouldReverseTransfer = booking.transfer_status !== "completed";
          const idempotencyKey = `booking-${booking.id}-cancel-${refundPercent}pct`;

          const { refund: stripeRefund, platformFunded } =
            await createRefundWithFallback({
              bookingId: booking.id,
              chargeId,
              amountPence: refundAmountPence,
              idempotencyKey,
              shouldReverseTransfer,
            });

          refundInitiated = true;
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              stripe_refund_id: stripeRefund.id,
              refund_status: stripeRefund.status,
              refund_amount: refundAmountPence / 100,
              refunded_at: new Date(),
              ...(platformFunded
                ? {
                    internal_admin_note: `Platform-funded refund (${refundPercent}%): expert transfer reversal failed — expert balance recovery required.`,
                  }
                : {}),
            },
          });
          if (platformFunded) {
            logAudit(
              req.user.id,
              "REFUND_PLATFORM_FUNDED",
              "PARENT",
              booking.expert_id,
              `Booking #${booking.id}: ${refundPercent}% refund platform-funded — expert balance/account issue. Manual recovery needed.`,
            );
          }
          console.log(
            `[cancelBooking] Stripe refund ${stripeRefund.id} (${refundAmountPence}p, ${refundPercent}%) — platform_funded=${platformFunded}`,
          );
        } else {
          console.warn(
            `[cancelBooking] No chargeId found — refund skipped for booking=${booking.id}`,
          );
        }
      } catch (stripeErr) {
        // Refund failure must not block the cancellation — booking is already CANCELLED.
        // Admin must manually process the refund.
        console.error(
          "[cancelBooking] Stripe refund failed:",
          stripeErr.message,
          stripeErr.code,
        );
        await prisma.booking
          .update({
            where: { id: booking.id },
            data: {
              internal_admin_note: `Stripe refund failed (${stripeErr.code || stripeErr.message}) — manual refund required.`,
            },
          })
          .catch(() => {});
      }
    } else {
      console.log(
        `[cancelBooking] No refund — refundPercent=${refundPercent}% wasConfirmed=${wasConfirmed} hasPaymentIntent=${!!booking.stripe_payment_intent_id}`,
      );
    }

    // ── Audit trail ────────────────────────────────────────────────────────
    logAudit(
      req.user.id,
      "BOOKING_CANCELLED",
      "PARENT",
      req.user.id,
      `Booking #${booking.id} cancelled · ${refundPercent}% refund`,
    );
    if (refundInitiated) {
      const refundAmountStr = (
        (Number(booking.amount) * refundPercent) /
        100
      ).toFixed(2);
      logAudit(
        req.user.id,
        "REFUND_ISSUED",
        "PARENT",
        req.user.id,
        `Booking #${booking.id} · ${booking.currency || "EUR"} ${refundAmountStr} refunded (${refundPercent}%)`,
      );
    }

    // ── Notify expert immediately ───────────────────────────────────────────
    sendBookingCancellationNotification({
      to: booking.expert.user.email,
      expertName: booking.expert.user.name,
      parentName: booking.parent.name,
      serviceTitle: booking.service.title,
      format: booking.format,
      scheduledAt: booking.scheduled_at,
      cancellationReason: reason || null,
      refundPercent,
      amount: booking.amount,
      currency: booking.currency || "EUR",
      bookingId: booking.id,
      timezone: booking.expert.timezone,
      language: booking.expert.user.language,
    }).catch((e) =>
      console.error("[Email] Cancellation notification failed:", e.message),
    );

    // ── Confirm cancellation to the parent ──────────────────────────────────
    sendParentCancellationConfirmationEmail({
      to: booking.parent.email,
      parentName: booking.parent.name,
      expertName: booking.expert.user.name,
      serviceTitle: booking.service.title,
      format: booking.format,
      scheduledAt: booking.scheduled_at,
      cancellationReason: reason || null,
      refundPercent,
      amount: booking.amount,
      currency: booking.currency || "EUR",
      bookingId: booking.id,
      timezone: booking.parent.timezone || booking.expert.timezone,
      language: booking.parent.language,
    }).catch((e) =>
      console.error("[Email] Cancellation confirmation failed:", e.message),
    );

    return res.json({
      success: true,
      refund_initiated: refundInitiated,
      refund_percent: refundPercent,
    });
  } catch (err) {
    console.error("[cancelBooking] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── PATCH /bookings/:id/reschedule — parent moves booking to a new slot ─────
//
// Rules:
//   • Only CONFIRMED bookings can be rescheduled
//   • Must be > 12 h before the CURRENT session start (same lockout as cancel)
//   • New slot must be different from the current slot
//   • No payment change: no new charge, no refund — Stripe is never touched
//   • is_reschedule is set to true so the audit trail is clear and the cancel
//     refund logic can never misfire during a reschedule operation
//   • Reminder flags are reset so reminders fire correctly for the new time
//   • transfer_due_at is recalculated for the new session end time
//
async function rescheduleBooking(req, res) {
  const { id } = req.params;
  const { newScheduledAt, withdrawalAccepted } = req.body;

  if (!newScheduledAt) {
    return res.status(400).json({ error: "newScheduledAt is required" });
  }

  const newDate = new Date(newScheduledAt);
  if (isNaN(newDate.getTime())) {
    return res.status(400).json({ error: "Invalid newScheduledAt date" });
  }
  if (newDate <= new Date()) {
    return res
      .status(400)
      .json({ error: "New scheduled time must be in the future" });
  }

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: {
          select: { name: true, email: true, language: true, timezone: true, notify_reschedule: true },
        },
        expert: {
          select: {
            address_street: true,
            address_city: true,
            address_postcode: true,
            address_country: true,
            business_info: { select: { address_country: true } },
            timezone: true,
            user: { select: { name: true, email: true, language: true } },
          },
        },
        service: { select: { title: true, duration_minutes: true, cluster: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (booking.status !== "CONFIRMED") {
      return res
        .status(400)
        .json({ error: "Only confirmed bookings can be rescheduled" });
    }
    if (booking.is_reschedule) {
      return res
        .status(400)
        .json({ error: "This booking has already been rescheduled once" });
    }
    if (booking.service.cluster === "EVENT") {
      // An event happens at one fixed time for every attendee — an individual
      // can't move it without leaving the event they actually signed up for.
      return res.status(400).json({
        error: "Event bookings can't be rescheduled. Please cancel and book another event if you can no longer attend this date.",
      });
    }

    // Enforce the 12 h window using the same boundary as cancellation
    const hoursUntilCurrent =
      (booking.scheduled_at.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilCurrent < 12) {
      return res
        .status(400)
        .json({
          error:
            "Bookings cannot be rescheduled within 12 hours of the session",
        });
    }

    // Prevent no-op reschedules
    if (booking.scheduled_at.getTime() === newDate.getTime()) {
      return res
        .status(400)
        .json({
          error: "New time must be different from the current session time",
        });
    }

    // Withdrawal (14-day cooling-off) consent, re-checked for the new session date.
    // Measured from the ORIGINAL booking date, not the session date or "now" —
    // the statutory withdrawal window is anchored to when the contract was formed.
    const withdrawalApplicable =
      newDate.getTime() - booking.created_at.getTime() <= WITHDRAWAL_WINDOW_MS;
    if (withdrawalApplicable && withdrawalAccepted !== true) {
      return res.status(400).json({
        error:
          "You must confirm the early-performance / withdrawal consent before rescheduling.",
        withdrawal_required: true,
      });
    }

    // Check the target slot is free for this expert (any status — unique constraint
    // on expert_id + scheduled_at applies table-wide, so even CANCELLED rows block)
    const conflict = await prisma.booking.findFirst({
      where: {
        expert_id: booking.expert_id,
        scheduled_at: newDate,
        id: { not: booking.id },
      },
    });
    if (conflict) {
      return res
        .status(409)
        .json({
          error:
            "That time slot is no longer available. Please choose another.",
        });
    }

    // Recalculate transfer_due_at (payout-settled marker) for the new session end
    const newSessionEnd = new Date(
      newDate.getTime() + booking.duration_minutes * 60 * 1000,
    );
    const newTransferDueAt = new Date(
      newSessionEnd.getTime() + PAYOUT_SETTLEMENT_MS,
    );

    // Snapshot the refund tier at this moment (before moving scheduled_at).
    // hoursUntilCurrent is already computed above; reschedule is blocked at <12h
    // so only 100 or 50 is possible here. Take the worst of the stored floor and
    // the current tier so the floor can only ratchet down, never up.
    const tierNow = hoursUntilCurrent >= 24 ? 100 : 50;
    const newMinRefundPercent = Math.min(booking.min_refund_percent, tierNow);

    const previousScheduledAt = booking.scheduled_at;
    const now = new Date();

    // Re-shown at reschedule in whatever language the original consent was
    // captured in, so the wording snapshot matches what's actually on screen.
    const existingConsent = await prisma.bookingConsent.findUnique({
      where: { booking_id: booking.id },
      select: { language: true },
    });
    const consentWording = getConsentWording(existingConsent?.language ?? "en");

    await prisma.$transaction([
      prisma.booking.update({
        where: { id: booking.id },
        data: {
          scheduled_at: newDate,
          is_reschedule: true, // guards against refund logic misfiring
          rescheduled_at: now,
          transfer_due_at: newTransferDueAt,
          reminder_1h_sent: false, // reset so reminders fire for the new time
          reminder_24h_sent: false,
          min_refund_percent: newMinRefundPercent,
        },
      }),
      prisma.bookingConsent.updateMany({
        where: { booking_id: booking.id },
        data: {
          withdrawal_applicable: withdrawalApplicable,
          withdrawal_accepted: withdrawalApplicable,
          withdrawal_accepted_at: withdrawalApplicable ? now : null,
          withdrawal_wording_snapshot: withdrawalApplicable ? consentWording.withdrawal : null,
          withdrawal_expander_snapshot: withdrawalApplicable ? consentWording.withdrawalExpander : null,
        },
      }),
    ]);

    console.log(
      `[rescheduleBooking] booking=${booking.id} rescheduled ${booking.scheduled_at.toISOString()} → ${newDate.toISOString()}`,
    );

    // ── Notify parent (updated confirmation) ───────────────────────────────
    if (booking.parent.notify_reschedule !== false) {
      const confirmationLanguage = existingConsent?.language || booking.parent.language || "en";
      const expertAddress = practiceAddressLine(booking.expert, confirmationLanguage);
      getLegalDocLinks(confirmationLanguage).then((legalLinks) => {
        sendBookingConfirmationEmail({
          to: booking.parent.email,
          name: booking.parent.name,
          expertName: booking.expert.user.name,
          serviceTitle: booking.service.title,
          format: booking.format,
          scheduledAt: newDate,
          durationMinutes: booking.duration_minutes,
          location:
            usesExpertAddress(booking.format)
              ? expertAddress || undefined
              : undefined,
          language: confirmationLanguage,
          amount: booking.amount,
          currency: booking.currency,
          userTimezone: booking.parent.timezone || booking.expert.timezone,
          withdrawalApplicable,
          bookingId: booking.id,
          ...legalLinks,
        });
      }).catch((e) =>
        console.error(
          "[Email] Reschedule parent confirmation failed:",
          e.message,
        ),
      );
    }

    // ── Notify expert (reschedule-specific notification) ───────────────────
    sendRescheduleNotificationEmail({
      to: booking.expert.user.email,
      expertName: booking.expert.user.name,
      parentName: booking.parent.name,
      parentEmail: booking.parent.email,
      serviceTitle: booking.service.title,
      format: booking.format,
      previousScheduledAt,
      newScheduledAt: newDate,
      durationMinutes: booking.duration_minutes,
      bookingId: booking.id,
      timezone: booking.expert.timezone,
      language: booking.expert.user.language,
    }).catch((e) =>
      console.error(
        "[Email] Reschedule expert notification failed:",
        e.message,
      ),
    );

    return res.json({ success: true, scheduled_at: newDate.toISOString() });
  } catch (err) {
    if (err.code === "P2002") {
      // Unique constraint race — another booking was created between our check and update
      return res
        .status(409)
        .json({
          error:
            "That time slot is no longer available. Please choose another.",
        });
    }
    console.error("[rescheduleBooking] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/upcoming — next 10 upcoming CONFIRMED bookings (expert) ───
async function getUpcomingAppointments(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const now = new Date();
    const bookings = await prisma.booking.findMany({
      where: {
        expert_id,
        scheduled_at: { gt: now },
        status: "CONFIRMED",
      },
      orderBy: { scheduled_at: "asc" },
      take: 10,
      include: {
        // Invoicing fields are scoped to this expert's own bookings only — never
        // exposed on cross-expert list/search/export endpoints.
        parent: {
          select: { name: true, email: true },
        },
        service: {
          select: { title: true, duration_minutes: true, format: true },
        },
        consent: { select: BILLING_SNAPSHOT_SELECT },
      },
    });

    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/calendar — CONFIRMED bookings in date range (expert view) ──
async function getCalendarBookings(req, res) {
  const { from, to } = req.query;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const where = {
      expert_id,
      status: "CONFIRMED", // only confirmed bookings appear on calendar
    };

    if (from || to) {
      where.scheduled_at = {};
      if (from) where.scheduled_at.gte = new Date(from);
      if (to) where.scheduled_at.lte = new Date(to);
    }

    const bookings = await prisma.booking.findMany({
      where,
      orderBy: { scheduled_at: "asc" },
      include: {
        parent: { select: { name: true, email: true } },
        service: { select: { title: true, format: true } },
      },
    });

    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/events/:serviceId/attendees — expert's attendee list ──────
//
// Every parent currently booked into one event (any non-cancelled booking).
// Attendees never see each other — this is an expert-only view.
async function getEventAttendees(req, res) {
  const { serviceId } = req.params;

  try {
    const expertId = await getExpertIdForUser(req.user.id);
    if (!expertId) return res.status(404).json({ error: "Expert profile not found" });

    const service = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
    if (!service || service.expert_id !== expertId) {
      return res.status(404).json({ error: "Service not found" });
    }
    if (service.cluster !== "EVENT") {
      return res.status(400).json({ error: "This service is not an event." });
    }

    const bookings = await prisma.booking.findMany({
      where: {
        service_id: service.id,
        status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT", "CANCELLED", "REFUNDED"] },
      },
      orderBy: { created_at: "asc" },
      select: {
        id: true,
        status: true,
        amount: true,
        currency: true,
        created_at: true,
        parent: { select: { name: true, email: true } },
      },
    });

    return res.json({
      service: { id: service.id, title: service.title, capacity: service.capacity, eventStartsAt: service.event_starts_at },
      attendees: bookings,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── PATCH /bookings/:id/complete — save expert session note (status unchanged) ─
// Status is managed automatically by the markCompletedBookings cron job.
async function markBookingComplete(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.expert_id !== expert_id)
      return res.status(403).json({ error: "Access denied" });
    if (!["CONFIRMED", "COMPLETED"].includes(booking.status)) {
      return res
        .status(400)
        .json({
          error: "Notes can only be added to confirmed or completed bookings",
        });
    }

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { expert_note: note.trim() || null },
    });
    return res.json({
      status: updated.status,
      expert_note: updated.expert_note,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── PATCH /bookings/:id/expert-note — save/update expert private notes ───────
async function saveExpertNote(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (typeof note !== "string") {
    return res.status(400).json({ error: "note must be a string" });
  }

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
    });
    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.expert_id !== expert_id)
      return res.status(403).json({ error: "Access denied" });

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { expert_note: note.trim() || null },
    });
    return res.json({ expert_note: updated.expert_note });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /bookings/past — paginated session history for the expert ────────────
async function getPastAppointments(req, res) {
  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where = {
      expert_id,
      OR: [
        { status: "CONFIRMED", scheduled_at: { lt: now } },
        { status: "COMPLETED" },
        { status: "CANCELLED" },
        { status: "REFUNDED" },
      ],
    };

    const [total, bookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.findMany({
        where,
        orderBy: { scheduled_at: "desc" },
        skip,
        take: limit,
        include: {
          parent: { select: { name: true, email: true } },
          service: { select: { title: true, duration_minutes: true } },
          consent: { select: BILLING_SNAPSHOT_SELECT },
        },
      }),
    ]);

    return res.json({ bookings, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── POST /bookings/:id/verify-payment — reconcile if webhook was missed ──────
//
// Called by BookingStatusPage after polling times out with status still
// PENDING_PAYMENT. Checks the PaymentIntent status directly with Stripe
// and confirms the booking if the payment succeeded.  Safe to call multiple
// times — the status guard makes it idempotent.
//
async function verifyPayment(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: {
          select: {
            id: true,
            name: true,
            email: true,
            // Forwarded to the expert for home-visit bookings only — the
            // gating lives at the send site, not here.
            phone: true,
            language: true,
            timezone: true,
            notify_booking_confirmation: true,
          },
        },
        expert: {
          select: {
            address_street: true,
            address_city: true,
            address_postcode: true,
            address_country: true,
            business_info: { select: { address_country: true } },
            timezone: true,
            notify_new_booking: true,
            user: { select: { name: true, email: true, language: true } },
          },
        },
        service: { select: { title: true, cluster: true } },
        consent: { select: { language: true, withdrawal_applicable: true, ...BILLING_SNAPSHOT_SELECT } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.parent_id !== req.user.id)
      return res.status(403).json({ error: "Access denied" });

    // Already resolved — nothing to do
    if (booking.status !== "PENDING_PAYMENT") {
      return res.json({ status: booking.status });
    }

    if (!booking.stripe_payment_intent_id) {
      return res
        .status(400)
        .json({ error: "No payment intent on record for this booking" });
    }

    const pi = await stripe.paymentIntents.retrieve(
      booking.stripe_payment_intent_id,
    );

    if (pi.status !== "succeeded") {
      // Payment genuinely not completed — return current state
      return res.json({ status: booking.status, pi_status: pi.status });
    }

    // Payment succeeded but webhook was missed — self-heal
    console.log(
      `[verifyPayment] Reconciling booking ${booking.id} — PI ${pi.id} succeeded but webhook not received`,
    );

    const sessionEndTime = new Date(
      booking.scheduled_at.getTime() + booking.duration_minutes * 60 * 1000,
    );
    const transferDueAt = new Date(
      sessionEndTime.getTime() + PAYOUT_SETTLEMENT_MS,
    );

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "CONFIRMED",
        stripe_charge_id: pi.latest_charge || null,
        transfer_status: "pending",
        transfer_due_at: transferDueAt,
      },
    });

    logAudit(
      booking.parent_id,
      "BOOKING_CONFIRMED",
      "PARENT",
      booking.parent_id,
      `Booking #${booking.id} confirmed (reconciled)`,
    );

    // Fire confirmation emails (same as webhook handler). Practice address is
    // localised per recipient (country name follows the email language).
    // Billing details are a per-booking snapshot (spec v1.7 §8) — collected
    // fresh for every booking, never read live from the parent's profile.
    const parentAddressVerify = [
      booking.consent?.billing_address,
      booking.consent?.billing_postcode,
      booking.consent?.billing_town,
      booking.consent?.billing_province,
      booking.consent?.billing_country,
    ]
      .filter(Boolean)
      .join(", ");
    if (booking.parent.notify_booking_confirmation !== false) {
      const confirmationLanguage = booking.consent?.language || booking.parent.language || "en";
      const isEventBooking = booking.service.cluster === "EVENT";
      const expertAddressVerify = practiceAddressLine(booking.expert, confirmationLanguage);
      getLegalDocLinks(confirmationLanguage).then((legalLinks) => {
        sendBookingConfirmationEmail({
          to: booking.parent.email,
          name: booking.parent.name,
          expertName: booking.expert.user.name,
          serviceTitle: booking.service.title,
          format: booking.format,
          scheduledAt: booking.scheduled_at,
          durationMinutes: booking.duration_minutes,
          location:
            usesExpertAddress(booking.format)
              ? expertAddressVerify || undefined
              : undefined,
          language: confirmationLanguage,
          amount: booking.amount,
          currency: booking.currency,
          userTimezone: booking.parent.timezone || booking.expert.timezone,
          withdrawalApplicable: booking.consent?.withdrawal_applicable,
          bookingId: booking.id,
          isEvent: isEventBooking,
          ...legalLinks,
        });
      }).catch((e) =>
        console.error(
          "[verifyPayment] Parent confirmation email failed:",
          e.message,
        ),
      );
    }

    if (booking.expert.notify_new_booking !== false) {
      const expertLanguage = booking.expert.user.language || "en";
      const expertAddressVerify = practiceAddressLine(booking.expert, expertLanguage);
      getLegalDocLinks(expertLanguage).then(({ policyUrl }) => {
        sendNewBookingNotificationEmail({
          to: booking.expert.user.email,
          expertName: booking.expert.user.name,
          parentName: booking.parent.name,
          parentEmail: booking.parent.email,
          // Home visits only — the expert travels to the parent, so they need
          // to reach them to agree the address. Withheld for every other format.
          parentPhone: isHomeVisit(booking.format) ? booking.parent.phone : null,
          serviceTitle: booking.service.title,
          format: booking.format,
          scheduledAt: booking.scheduled_at,
          durationMinutes: booking.duration_minutes,
          location:
            usesExpertAddress(booking.format)
              ? expertAddressVerify || undefined
              : undefined,
          amount: booking.amount,
          currency: booking.currency,
          bookingId: booking.id,
          timezone: booking.expert.timezone,
          language: expertLanguage,
          policyUrl,
          parentAddress: parentAddressVerify || undefined,
          parentFiscalCode: booking.consent?.billing_fiscal_code || undefined,
          parentInvoiceHolder: booking.consent?.billing_invoice_holder || undefined,
          isEvent: booking.service.cluster === "EVENT",
        });
      }).catch((e) =>
        console.error(
          "[verifyPayment] Expert notification email failed:",
          e.message,
        ),
      );
    }

    return res.json({ status: "CONFIRMED" });
  } catch (err) {
    console.error("[verifyPayment]", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── PATCH /bookings/:id/link-sent — expert marks session link as sent ───────
async function markSessionLinkSent(req, res) {
  const { id } = req.params;

  try {
    const expert_id = await getExpertIdForUser(req.user.id);
    if (!expert_id)
      return res.status(404).json({ error: "Expert profile not found" });

    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
    });
    if (!booking || booking.expert_id !== expert_id) {
      return res.status(404).json({ error: "Booking not found" });
    }

    const updated = await prisma.booking.update({
      where: { id: parseInt(id) },
      data: { session_link_sent: true },
    });

    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── POST /bookings/:id/expert-cancel — expert cancels a confirmed booking ─────
//
// Always issues a full refund regardless of timing, then emails the parent.
//
// Shared by expertCancelBooking (one booking, HTTP) and expertCancelEvent
// (every attendee of an event, looped) — everything from issuing the refund
// through notifying the parent/expert. Expects `booking` already loaded with
// the includes both callers use. Returns { stripeRefund, platformFunded } or
// throws (caller decides how to translate that into a response).
async function performExpertCancellation(booking, actingUserId, { sendExpertConfirmation = true } = {}) {
  const cancelledAt = new Date();
  let stripeRefund = null;
    let platformFunded = false;
    const refundedAmount = parseFloat(booking.amount) || 0;

    if (booking.status === "CONFIRMED" && booking.stripe_payment_intent_id) {
      let chargeId = booking.stripe_charge_id;
      if (!chargeId) {
        try {
          const pi = await stripe.paymentIntents.retrieve(
            booking.stripe_payment_intent_id,
          );
          chargeId = pi.latest_charge;
        } catch (piErr) {
          console.error(
            "[expertCancelBooking] Failed to retrieve PaymentIntent:",
            piErr.message,
          );
        }
      }
      if (chargeId) {
        // Expert cancellations always issue a full refund (no amount = full charge).
        // Idempotency key is stable per booking so a retry returns the same refund.
        try {
          const result = await createRefundWithFallback({
            bookingId: booking.id,
            chargeId,
            amountPence: undefined, // full refund
            idempotencyKey: `booking-${booking.id}-expert-cancel`,
            shouldReverseTransfer: booking.transfer_status !== "completed",
          });
          stripeRefund = result.refund;
          platformFunded = result.platformFunded;
        } catch (refundErr) {
          // Refund failure must NOT block the cancellation — the booking is still
          // marked CANCELLED below. Admin must manually process the refund.
          console.error(
            "[expertCancelBooking] Stripe refund failed:",
            refundErr.message,
            refundErr.code,
          );
          await prisma.booking
            .update({
              where: { id: booking.id },
              data: {
                internal_admin_note: `Expert cancel: Stripe refund failed (${refundErr.code || refundErr.message}) — manual full refund required for parent.`,
              },
            })
            .catch(() => {});
        }
      }
    } else if (
      booking.status === "PENDING_PAYMENT" &&
      booking.stripe_payment_intent_id
    ) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      } catch (_) {
        /* may already be expired */
      }
    }

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: booking.status === "CONFIRMED" ? "REFUNDED" : "CANCELLED",
        cancellation_reason: "Cancelled by expert",
        cancelled_at: cancelledAt,
        transfer_status: "skipped",
        ...(stripeRefund
          ? {
              stripe_refund_id: stripeRefund.id,
              refund_status: stripeRefund.status,
              refund_amount: refundedAmount,
              refunded_at: new Date(),
              ...(platformFunded
                ? {
                    internal_admin_note:
                      "Expert cancel: platform-funded full refund — expert balance/account issue. Manual recovery required.",
                  }
                : {}),
            }
          : {}),
      },
    });

    console.log(
      `[expertCancelBooking] booking=${booking.id} cancelled by expert user=${actingUserId} refund=${stripeRefund?.id || "none"} platform_funded=${platformFunded}`,
    );

    // Same as a parent self-cancelling: freeing one attendee's spot on an
    // event that auto-deactivated when full should reopen it, unless the
    // caller is cancelling the whole event (expertCancelEvent forces
    // is_active back to false once its loop finishes).
    if (booking.service.cluster === "EVENT" && !booking.service.is_active && booking.service.capacity) {
      const stillBookedCount = await prisma.booking.count({
        where: {
          service_id: booking.service.id,
          status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] },
        },
      });
      if (stillBookedCount < booking.service.capacity) {
        await prisma.service.update({ where: { id: booking.service.id }, data: { is_active: true } });
      }
    }

    logAudit(
      actingUserId,
      "BOOKING_CANCELLED_BY_EXPERT",
      "PARENT",
      booking.parent_id,
      `Booking #${booking.id} cancelled by specialist${stripeRefund ? " · full refund issued" : " · refund pending manual action"}`,
    );
    if (platformFunded) {
      logAudit(
        actingUserId,
        "REFUND_PLATFORM_FUNDED",
        "PARENT",
        booking.expert_id,
        `Booking #${booking.id}: expert-cancel full refund platform-funded — expert balance/account issue. Manual recovery needed.`,
      );
    }

    // Email the parent — fire-and-forget. Only sent once the refund has
    // actually succeeded (finding 3, Expert Cancellation Notice review):
    // never claim "a full refund has been issued" before it has.
    if (
      booking.status === "CONFIRMED" &&
      booking.parent.notify_expert_cancellation !== false &&
      stripeRefund
    ) {
      const parentLanguage = booking.consent?.language || booking.parent.language || "en";
      sendExpertCancelledSessionEmail({
        to: booking.parent.email,
        parentName: booking.parent.name,
        expertName: booking.expert.user.name,
        serviceTitle: booking.service.title,
        scheduledAt: booking.scheduled_at,
        amount: refundedAmount,
        currency: booking.currency || "EUR",
        bookingId: booking.id,
        timezone: booking.parent.timezone || booking.expert.timezone,
        language: parentLanguage,
      }).catch((e) =>
        console.error("[Email] Expert cancel parent email failed:", e.message),
      );
    }

    // Confirm to the expert what their cancellation caused — same trigger
    // point as the parent email above (only after the refund has succeeded),
    // independent of the parent's own notification preference. Suppressed
    // for a bulk whole-event cancel, which sends one summary instead of one
    // email per attendee.
    if (sendExpertConfirmation && booking.status === "CONFIRMED" && stripeRefund) {
      sendExpertCancellationConfirmationEmail({
        to: booking.expert.user.email,
        expertName: booking.expert.user.name,
        parentName: booking.parent.name,
        serviceTitle: booking.service.title,
        scheduledAt: booking.scheduled_at,
        bookingId: booking.id,
        timezone: booking.expert.timezone,
        language: booking.expert.user.language,
      }).catch((e) =>
        console.error("[Email] Expert cancellation confirmation email failed:", e.message),
      );
    }

    return { stripeRefund, platformFunded };
}

// ─── POST /bookings/:id/expert-cancel — expert cancels a confirmed booking ────
//
// Always issues a full refund regardless of timing, then emails the parent.
//
async function expertCancelBooking(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent: {
          select: { name: true, email: true, notify_expert_cancellation: true, timezone: true, language: true },
        },
        expert: {
          select: {
            user_id: true,
            timezone: true,
            user: { select: { name: true, email: true, language: true } },
          },
        },
        service: { select: { id: true, title: true, cluster: true, capacity: true, is_active: true } },
        consent: { select: { language: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });

    // Only the expert who owns this booking can cancel it
    if (booking.expert.user_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }

    if (!["CONFIRMED", "PENDING_PAYMENT"].includes(booking.status)) {
      return res
        .status(400)
        .json({
          error: `Booking cannot be cancelled (current status: ${booking.status})`,
        });
    }

    await performExpertCancellation(booking, req.user.id);
    return res.json({ success: true });
  } catch (err) {
    console.error("[expertCancelBooking] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── POST /services/:serviceId/cancel-event — expert cancels an entire event ──
//
// Cancels every still-active booking against this event, refunding each
// attendee through the same path as a single expert-cancel (one booking's
// refund failing never blocks the others). Leaves the service deactivated —
// the event is off, not merely down one attendee.
async function expertCancelEvent(req, res) {
  const { serviceId } = req.params;

  try {
    const service = await prisma.service.findUnique({ where: { id: parseInt(serviceId) } });
    if (!service) return res.status(404).json({ error: "Service not found" });

    const expertId = await getExpertIdForUser(req.user.id);
    if (!expertId || service.expert_id !== expertId) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (service.cluster !== "EVENT") {
      return res.status(400).json({ error: "This service is not an event." });
    }

    const bookings = await prisma.booking.findMany({
      where: { service_id: service.id, status: { in: ["PENDING", "CONFIRMED", "PENDING_PAYMENT"] } },
      include: {
        parent: {
          select: { name: true, email: true, notify_expert_cancellation: true, timezone: true, language: true },
        },
        expert: {
          select: {
            user_id: true,
            timezone: true,
            user: { select: { name: true, email: true, language: true } },
          },
        },
        service: { select: { id: true, title: true, cluster: true, capacity: true, is_active: true } },
        consent: { select: { language: true } },
      },
    });

    let cancelled = 0;
    let failed = 0;
    for (const booking of bookings) {
      try {
        await performExpertCancellation(booking, req.user.id, { sendExpertConfirmation: false });
        cancelled += 1;
      } catch (err) {
        failed += 1;
        console.error(`[expertCancelEvent] booking=${booking.id} failed:`, err.message);
      }
    }

    // The whole event is off — force this regardless of what the per-booking
    // reactivation logic did while the loop was running.
    await prisma.service.update({ where: { id: service.id }, data: { is_active: false } });

    logAudit(req.user.id, "EVENT_CANCELLED_BY_EXPERT", "SERVICE", service.id,
      `Event #${service.id} cancelled — ${cancelled} attendee(s) refunded${failed ? `, ${failed} failed and need manual follow-up` : ""}.`);

    return res.json({ success: true, cancelled, failed });
  } catch (err) {
    console.error("[expertCancelEvent] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── POST /bookings/:id/abandon — parent exits checkout, releases the slot ────
//
// Called when the parent clicks "Edit booking" on the payment screen.
// Cancels the Stripe PaymentIntent (so no money is collected) and deletes the
// PENDING_PAYMENT booking row so the slot is immediately available for others.
// Deletion (not cancellation) is intentional — same pattern as PaymentIntent
// failure cleanup — so the unique-constraint slot is truly freed.
//
async function abandonBooking(req, res) {
  const { id } = req.params;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.parent_id !== req.user.id) {
      return res.status(403).json({ error: "Access denied" });
    }
    if (booking.status !== "PENDING_PAYMENT") {
      return res
        .status(400)
        .json({ error: "Only pending-payment bookings can be abandoned" });
    }

    // Cancel the PaymentIntent so Stripe never charges the card
    if (booking.stripe_payment_intent_id) {
      try {
        await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id);
      } catch (e) {
        // PI may already be expired/cancelled — log and continue
        console.warn(
          `[abandonBooking] PI cancel skipped for ${booking.stripe_payment_intent_id}:`,
          e.message,
        );
      }
    }

    // Delete the row — frees the unique (expert_id, scheduled_at) slot
    await prisma.booking.delete({ where: { id: booking.id } });

    console.log(
      `[abandonBooking] booking=${booking.id} deleted — slot released for parent=${req.user.id}`,
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("[abandonBooking] Error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  createBooking,
  getBookingById,
  getMyBookings,
  verifyPayment,
  cancelBooking,
  abandonBooking,
  rescheduleBooking,
  expertCancelBooking,
  expertCancelEvent,
  getEventAttendees,
  getUpcomingAppointments,
  getPastAppointments,
  getCalendarBookings,
  markSessionLinkSent,
  markBookingComplete,
  saveExpertNote,
  reportImLate,
};
