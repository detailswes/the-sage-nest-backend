const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const prisma = require("../prisma/client");
const { sendPasswordResetEmail, sendVerificationEmail } = require("../utils/email");

const PAGE_LIMIT = 10;
const VALID_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"];
const VALID_QUALIFICATION_TYPES = [
  "LACTATION_CONSULTANT", "BREASTFEEDING_COUNSELLOR", "INFANT_SLEEP_CONSULTANT",
  "DOULA", "MIDWIFE", "BABY_OSTEOPATH", "PAEDIATRIC_NUTRITIONIST",
  "EARLY_YEARS_SPECIALIST", "POSTNATAL_PHYSIOTHERAPIST", "PARENTING_COACH", "OTHER",
];
const VALID_CLUSTERS = ["FOR_MUM", "FOR_BABY", "PACKAGE", "GIFT"];

// List all experts — paginated + filtered + searched
async function listExperts(req, res) {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT));
  const skip  = (page - 1) * limit;
  const { status, search, city, qualification, cluster } = req.query;

  // Base: only EXPERT role accounts
  const baseWhere = { user: { role: "EXPERT" } };

  // Build full where clause (for table rows)
  const where = { ...baseWhere };

  if (status && VALID_STATUSES.includes(status)) {
    where.status = status;
  }

  // Name search — case-insensitive contains on user.name
  if (search?.trim()) {
    where.user = { ...where.user, name: { contains: search.trim(), mode: "insensitive" } };
  }

  // City filter — case-insensitive contains
  if (city?.trim()) {
    where.address_city = { contains: city.trim(), mode: "insensitive" };
  }

  // Qualification type filter
  if (qualification && VALID_QUALIFICATION_TYPES.includes(qualification)) {
    where.qualifications = { some: { type: qualification } };
  }

  // Service cluster filter
  if (cluster && VALID_CLUSTERS.includes(cluster)) {
    where.services = { some: { cluster } };
  }

  // Include all data needed for detail modal — loaded once, no extra round-trips
  const include = {
    user:           { select: { name: true, email: true, created_at: true, is_verified: true, login_attempts: true, locked_until: true } },
    qualifications: { orderBy: { created_at: "asc" } },
    certifications: { orderBy: { created_at: "asc" } },
    insurance:      true,
    business_info:  true,
    services:       { orderBy: { id: "asc" } },
  };

  try {
    const [total, data, pendingCount, approvedCount, rejectedCount, suspendedCount] =
      await Promise.all([
        prisma.expert.count({ where }),
        prisma.expert.findMany({ where, include, orderBy: { id: "asc" }, skip, take: limit }),
        prisma.expert.count({ where: { ...baseWhere, status: "PENDING" } }),
        prisma.expert.count({ where: { ...baseWhere, status: "APPROVED" } }),
        prisma.expert.count({ where: { ...baseWhere, status: "REJECTED" } }),
        prisma.expert.count({ where: { ...baseWhere, status: "SUSPENDED" } }),
      ]);

    return res.json({
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      counts: {
        all:       pendingCount + approvedCount + rejectedCount + suspendedCount,
        PENDING:   pendingCount,
        APPROVED:  approvedCount,
        REJECTED:  rejectedCount,
        SUSPENDED: suspendedCount,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Approve an expert
async function approveExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({ where: { id: parseInt(id) } });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "APPROVED" },
    });
    return res.json({ message: "Expert approved", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Reject an expert
async function rejectExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({ where: { id: parseInt(id) } });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "REJECTED" },
    });
    return res.json({ message: "Expert rejected", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Toggle: APPROVED ↔ REJECTED
async function toggleApproval(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({ where: { id: parseInt(id) } });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const newStatus = expert.status === "APPROVED" ? "REJECTED" : "APPROVED";
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: newStatus },
    });
    return res.json({
      message: `Expert ${newStatus === "APPROVED" ? "approved" : "rejected"}`,
      expert: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── New account management actions ──────────────────────────────────────────

// Send a password reset email to an expert
async function sendPasswordReset(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: expert.user_id },
      data: { reset_token: resetToken, reset_token_expires_at: resetTokenExpiresAt },
    });

    sendPasswordResetEmail({
      to: expert.user.email,
      name: expert.user.name,
      resetToken,
    }).catch((err) => console.error("Failed to send password reset email:", err.message));

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Resend verification email to an unverified expert
async function resendVerification(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.user.is_verified) {
      return res.status(400).json({ error: "Expert email is already verified." });
    }

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await prisma.user.update({
      where: { id: expert.user_id },
      data: { verification_code: verificationCode, verification_expires_at: verificationExpiresAt },
    });

    sendVerificationEmail({
      to: expert.user.email,
      name: expert.user.name,
      userId: expert.user_id,
      verificationCode,
    }).catch((err) => console.error("Failed to resend verification email:", err.message));

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Manually mark an expert's email as verified
async function manuallyVerify(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.user.is_verified) {
      return res.status(400).json({ error: "Expert email is already verified." });
    }

    await prisma.user.update({
      where: { id: expert.user_id },
      data: {
        is_verified: true,
        verification_code: null,
        verification_expires_at: null,
      },
    });

    console.log(`[ADMIN] User ${expert.user_id} (${expert.user.email}) manually verified by admin ${req.user?.id}`);

    return res.json({ verified: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Suspend an approved expert
async function suspendExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({ where: { id: parseInt(id) } });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.status === "SUSPENDED") {
      return res.status(400).json({ error: "Expert is already suspended." });
    }

    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "SUSPENDED" },
    });

    console.log(`[ADMIN] Expert ${id} suspended by admin ${req.user?.id}`);

    return res.json({ message: "Expert suspended", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Export expert tax data as CSV for a given year
async function exportTaxData(req, res) {
  const { id } = req.params;
  const year = parseInt(req.query.year);
  if (!year || year < 2000 || year > 2100) {
    return res.status(400).json({ error: "Valid year query parameter is required." });
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: {
        user:          { select: { name: true, email: true, created_at: true } },
        business_info: true,
      },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    // Bookings in the requested year where payment was received
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd   = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        expert_id:    expert.id,
        status:       { in: ["CONFIRMED", "COMPLETED"] },
        scheduled_at: { gte: yearStart, lt: yearEnd },
      },
      include: { service: { select: { title: true } } },
      orderBy: { scheduled_at: "asc" },
    });

    const bi = expert.business_info;

    // ── CSV helper ──────────────────────────────────────────────────────────
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const row  = (...cols) => cols.map(esc).join(",");
    const line = (...cols) => row(...cols) + "\r\n";

    let csv = "";

    // Header
    csv += line(`EXPERT TAX REPORT — ${year}`);
    csv += line(`Generated`, new Date().toISOString().split("T")[0]);
    csv += "\r\n";

    // Expert identity
    csv += line("EXPERT IDENTITY");
    csv += line("Name", "Email", "Joined");
    csv += line(
      expert.user?.name  || "",
      expert.user?.email || "",
      expert.user?.created_at ? new Date(expert.user.created_at).toISOString().split("T")[0] : ""
    );
    csv += "\r\n";

    // Business information
    csv += line("BUSINESS INFORMATION");
    if (bi) {
      csv += line("Entity Type",       bi.entity_type === "INDIVIDUAL" ? "Individual" : "Company / Legal Entity");
      csv += line("Full Legal Name",   bi.legal_name);
      if (bi.entity_type === "INDIVIDUAL" && bi.date_of_birth) {
        csv += line("Date of Birth",   new Date(bi.date_of_birth).toISOString().split("T")[0]);
      }
      csv += line("Primary Address",   bi.primary_address);
      csv += line("TIN",               bi.tin);
      if (bi.vat_number)         csv += line("VAT Number",              bi.vat_number);
      if (bi.company_reg_number) csv += line("Company Reg. Number",     bi.company_reg_number);
      csv += line("IBAN",              bi.iban);
      csv += line("Business Email",    bi.business_email);
      csv += line("Website",           bi.website);
      if (bi.municipality)       csv += line("Municipality",             bi.municipality);
      if (bi.business_address)   csv += line("Business Address",         bi.business_address);
    } else {
      csv += line("No business information on file");
    }
    csv += "\r\n";

    // Payments
    csv += line(`PAYMENTS (${year})`);
    csv += line("Date", "Service", "Duration (min)", "Gross Amount (€)", "Platform Fee (€)", "Net Payout (€)", "Status");

    let totalGross = 0;
    let totalFee   = 0;

    for (const b of bookings) {
      const gross = parseFloat(b.amount      || 0);
      const fee   = parseFloat(b.platform_fee || 0);
      totalGross += gross;
      totalFee   += fee;
      csv += line(
        new Date(b.scheduled_at).toISOString().split("T")[0],
        b.service?.title || "",
        b.duration_minutes,
        gross.toFixed(2),
        fee.toFixed(2),
        (gross - fee).toFixed(2),
        b.status
      );
    }

    csv += "\r\n";
    csv += line("TOTALS");
    csv += line("Total Bookings", "Total Gross (€)", "Total Fees (€)", "Total Net Payout (€)");
    csv += line(
      bookings.length,
      totalGross.toFixed(2),
      totalFee.toFixed(2),
      (totalGross - totalFee).toFixed(2)
    );

    const safeName = (expert.user?.name || `expert-${id}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();
    const filename = `tax_report_${safeName}_${year}.csv`;

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    return res.send("\uFEFF" + csv); // BOM for Excel UTF-8 compatibility
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Reactivate a suspended expert (restores to APPROVED)
async function reactivateExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({ where: { id: parseInt(id) } });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.status !== "SUSPENDED") {
      return res.status(400).json({ error: "Expert is not suspended." });
    }

    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "APPROVED" },
    });

    console.log(`[ADMIN] Expert ${id} reactivated by admin ${req.user?.id}`);

    return res.json({ message: "Expert reactivated", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// GET /admin/bookings?expertId=X — list confirmed bookings for an expert
async function listExpertBookings(req, res) {
  const { expertId } = req.query;
  if (!expertId) return res.status(400).json({ error: "expertId is required" });

  try {
    const bookings = await prisma.booking.findMany({
      where: {
        expert_id: parseInt(expertId),
        status: { in: ["CONFIRMED", "CANCELLED", "REFUNDED"] },
      },
      orderBy: { scheduled_at: "desc" },
      take: 20,
      include: {
        parent:  { select: { name: true, email: true } },
        service: { select: { title: true } },
      },
    });
    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// POST /admin/bookings/:id/refund — admin issues a manual refund regardless of 24h window
async function manualRefund(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        parent:  { select: { name: true, email: true } },
        service: { select: { title: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({ error: `Booking cannot be refunded (status: ${booking.status})` });
    }
    if (!booking.stripe_payment_intent_id) {
      return res.status(400).json({ error: "No payment found for this booking" });
    }

    // Use stored charge ID — fall back to retrieving from Stripe for older bookings
    let chargeId = booking.stripe_charge_id;
    if (!chargeId) {
      const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
      chargeId = pi.latest_charge;
    }

    if (!chargeId) {
      return res.status(400).json({ error: "Could not locate charge for this booking" });
    }

    await stripe.refunds.create({ charge: chargeId });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status:              "REFUNDED",
        cancellation_reason: reason || "Admin manual refund",
        cancelled_at:        new Date(),
        transfer_status:     "skipped",
      },
    });

    console.log(`[ADMIN] Manual refund issued for booking ${id} by admin ${req.user?.id}`);

    return res.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Manual refund error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GET /admin/legal-documents — current versions of PP and T&Cs ────────────
async function getLegalDocuments(req, res) {
  try {
    const [pp, tc] = await Promise.all([
      prisma.legalDocument.findFirst({
        where: { type: 'PRIVACY_POLICY' },
        orderBy: { effective_from: 'desc' },
      }),
      prisma.legalDocument.findFirst({
        where: { type: 'TERMS_CONDITIONS' },
        orderBy: { effective_from: 'desc' },
      }),
    ]);
    return res.json({ privacy_policy: pp, terms_conditions: tc });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

// ─── POST /admin/legal-documents/bump — publish a new version ────────────────
// Body: { type: 'PRIVACY_POLICY' | 'TERMS_CONDITIONS', version: '1.1' }
// Inserts a new row — all parents will be prompted to re-accept on next login (PP)
// or on next booking (TC).
async function bumpLegalDocument(req, res) {
  const { type, version } = req.body;

  if (!['PRIVACY_POLICY', 'TERMS_CONDITIONS'].includes(type)) {
    return res.status(400).json({ error: 'type must be PRIVACY_POLICY or TERMS_CONDITIONS' });
  }
  if (!version || typeof version !== 'string' || !version.trim()) {
    return res.status(400).json({ error: 'version is required' });
  }

  try {
    const existing = await prisma.legalDocument.findUnique({
      where: { type_version: { type, version: version.trim() } },
    });
    if (existing) {
      return res.status(409).json({ error: `Version ${version} already exists for ${type}` });
    }

    const doc = await prisma.legalDocument.create({
      data: { type, version: version.trim() },
    });

    console.log(`[ADMIN] Legal document bumped: ${type} → v${version} by admin ${req.user?.id}`);
    return res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
}

module.exports = {
  listExperts,
  approveExpert,
  rejectExpert,
  toggleApproval,
  sendPasswordReset,
  resendVerification,
  manuallyVerify,
  suspendExpert,
  reactivateExpert,
  exportTaxData,
  listExpertBookings,
  manualRefund,
  getLegalDocuments,
  bumpLegalDocument,
};
