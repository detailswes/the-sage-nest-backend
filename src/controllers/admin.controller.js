const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const prisma = require("../prisma/client");
const {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendChangesRequestedEmail,
} = require("../utils/email");

const PAGE_LIMIT = 10;
const VALID_STATUSES = [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "SUSPENDED",
  "CHANGES_REQUESTED",
];
const VALID_QUALIFICATION_TYPES = [
  "LACTATION_CONSULTANT",
  "BREASTFEEDING_COUNSELLOR",
  "INFANT_SLEEP_CONSULTANT",
  "DOULA",
  "MIDWIFE",
  "BABY_OSTEOPATH",
  "PAEDIATRIC_NUTRITIONIST",
  "EARLY_YEARS_SPECIALIST",
  "POSTNATAL_PHYSIOTHERAPIST",
  "PARENTING_COACH",
  "OTHER",
];
const VALID_CLUSTERS = ["FOR_MUM", "FOR_BABY", "PACKAGE", "GIFT"];

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deleteFile(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {}
  }
}

/**
 * Write one row to AdminAuditLog. Fire-and-forget — never throws.
 * admin_id has no FK constraint so logs survive GDPR-deleted admin accounts.
 */
async function logAudit(adminId, action, entityType, entityId, note = null) {
  try {
    await prisma.adminAuditLog.create({
      data: {
        admin_id: adminId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        note,
      },
    });
  } catch (err) {
    console.error("[AUDIT] Failed to write audit log:", err.message);
  }
}

// ─── Expert list ──────────────────────────────────────────────────────────────

async function listExperts(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT)
  );
  const skip = (page - 1) * limit;
  const { status, search, city, qualification, cluster } = req.query;

  const baseWhere = { user: { role: "EXPERT" } };
  const where = { ...baseWhere };

  if (status && VALID_STATUSES.includes(status)) {
    where.status = status;
  }
  if (search?.trim()) {
    where.user = {
      ...where.user,
      name: { contains: search.trim(), mode: "insensitive" },
    };
  }
  if (city?.trim()) {
    where.address_city = { contains: city.trim(), mode: "insensitive" };
  }
  if (qualification && VALID_QUALIFICATION_TYPES.includes(qualification)) {
    where.qualifications = { some: { type: qualification } };
  }
  if (cluster && VALID_CLUSTERS.includes(cluster)) {
    where.services = { some: { cluster } };
  }

  const include = {
    user: {
      select: {
        name: true,
        email: true,
        created_at: true,
        is_verified: true,
        login_attempts: true,
        locked_until: true,
      },
    },
    qualifications: { orderBy: { created_at: "asc" } },
    certifications: { orderBy: { created_at: "asc" } },
    insurance: true,
    business_info: true,
    services: { orderBy: { id: "asc" } },
  };

  try {
    const [
      total,
      data,
      pendingCount,
      approvedCount,
      rejectedCount,
      suspendedCount,
      changesCount,
    ] = await Promise.all([
      prisma.expert.count({ where }),
      prisma.expert.findMany({
        where,
        include,
        orderBy: { id: "asc" },
        skip,
        take: limit,
      }),
      prisma.expert.count({ where: { ...baseWhere, status: "PENDING" } }),
      prisma.expert.count({ where: { ...baseWhere, status: "APPROVED" } }),
      prisma.expert.count({ where: { ...baseWhere, status: "REJECTED" } }),
      prisma.expert.count({ where: { ...baseWhere, status: "SUSPENDED" } }),
      prisma.expert.count({
        where: { ...baseWhere, status: "CHANGES_REQUESTED" },
      }),
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
        all:
          pendingCount +
          approvedCount +
          rejectedCount +
          suspendedCount +
          changesCount,
        PENDING: pendingCount,
        APPROVED: approvedCount,
        REJECTED: rejectedCount,
        SUSPENDED: suspendedCount,
        CHANGES_REQUESTED: changesCount,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Status actions ───────────────────────────────────────────────────────────

async function approveExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: {
        status: "APPROVED",
        change_request_note: null,
        change_requested_at: null,
      },
    });
    await logAudit(req.user.id, "APPROVE", "EXPERT", parseInt(id));
    return res.json({ message: "Expert approved", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function rejectExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "REJECTED" },
    });
    await logAudit(req.user.id, "REJECT", "EXPERT", parseInt(id));
    return res.json({ message: "Expert rejected", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// Toggle: APPROVED ↔ REJECTED (legacy — keep for backward compat)
async function toggleApproval(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    const newStatus = expert.status === "APPROVED" ? "REJECTED" : "APPROVED";
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: newStatus },
    });
    await logAudit(
      req.user.id,
      newStatus === "APPROVED" ? "APPROVE" : "REJECT",
      "EXPERT",
      parseInt(id)
    );
    return res.json({
      message: `Expert ${newStatus === "APPROVED" ? "approved" : "rejected"}`,
      expert: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function suspendExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    if (expert.status === "SUSPENDED") {
      return res.status(400).json({ error: "Expert is already suspended." });
    }
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "SUSPENDED" },
    });
    await logAudit(req.user.id, "SUSPEND", "EXPERT", parseInt(id));
    return res.json({ message: "Expert suspended", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function reactivateExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });
    if (expert.status !== "SUSPENDED") {
      return res.status(400).json({ error: "Expert is not suspended." });
    }
    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { status: "APPROVED" },
    });
    await logAudit(req.user.id, "REACTIVATE", "EXPERT", parseInt(id));
    return res.json({ message: "Expert reactivated", expert: updated });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Request changes ──────────────────────────────────────────────────────────

async function requestChanges(req, res) {
  const { id } = req.params;
  const { note } = req.body;

  if (!note || !note.trim()) {
    return res
      .status(400)
      .json({ error: "A note explaining the required changes is required." });
  }
  if (note.trim().length > 2000) {
    return res
      .status(400)
      .json({ error: "Note must be 2000 characters or fewer." });
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    // Only meaningful for experts still in the review pipeline
    const allowedStatuses = ["PENDING", "APPROVED", "CHANGES_REQUESTED"];
    if (!allowedStatuses.includes(expert.status)) {
      return res.status(400).json({
        error: `Cannot request changes on a ${expert.status.toLowerCase()} account.`,
      });
    }

    const trimmedNote = note.trim();

    await prisma.expert.update({
      where: { id: parseInt(id) },
      data: {
        status: "CHANGES_REQUESTED",
        change_request_note: trimmedNote,
        change_requested_at: new Date(),
      },
    });

    sendChangesRequestedEmail({
      to: expert.user.email,
      name: expert.user.name,
      note: trimmedNote,
    }).catch((err) =>
      console.error(
        "[ADMIN] Failed to send changes-requested email:",
        err.message
      )
    );

    await logAudit(
      req.user.id,
      "REQUEST_CHANGES",
      "EXPERT",
      parseInt(id),
      trimmedNote
    );

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Publish / unpublish ──────────────────────────────────────────────────────

async function unpublishExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.status !== "APPROVED") {
      return res.status(400).json({
        error:
          "Only approved experts can be force-unpublished. Use Suspend for non-approved accounts.",
      });
    }
    if (!expert.is_published) {
      return res.status(400).json({ error: "Expert is already unlisted." });
    }

    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { is_published: false },
    });

    await logAudit(req.user.id, "UNPUBLISH", "EXPERT", parseInt(id));

    return res.json({
      message: "Expert unlisted from parent search",
      expert: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function republishExpert(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.status !== "APPROVED") {
      return res.status(400).json({
        error: "Only approved experts can be republished.",
      });
    }
    if (expert.is_published) {
      return res.status(400).json({ error: "Expert is already published." });
    }

    const updated = await prisma.expert.update({
      where: { id: parseInt(id) },
      data: { is_published: true },
    });

    await logAudit(req.user.id, "REPUBLISH", "EXPERT", parseInt(id));

    return res.json({
      message: "Expert restored to parent search",
      expert: updated,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Support tools ────────────────────────────────────────────────────────────

async function sendPasswordReset(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: expert.user_id },
      data: {
        reset_token: resetToken,
        reset_token_expires_at: resetTokenExpiresAt,
      },
    });

    sendPasswordResetEmail({
      to: expert.user.email,
      name: expert.user.name,
      resetToken,
    }).catch((err) =>
      console.error("Failed to send password reset email:", err.message)
    );

    await logAudit(req.user.id, "SEND_PASSWORD_RESET", "EXPERT", parseInt(id));

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function resendVerification(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.user.is_verified) {
      return res
        .status(400)
        .json({ error: "Expert email is already verified." });
    }

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: expert.user_id },
      data: {
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
      },
    });

    sendVerificationEmail({
      to: expert.user.email,
      name: expert.user.name,
      userId: expert.user_id,
      verificationCode,
    }).catch((err) =>
      console.error("Failed to resend verification email:", err.message)
    );

    await logAudit(req.user.id, "RESEND_VERIFICATION", "EXPERT", parseInt(id));

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function manuallyVerify(req, res) {
  const { id } = req.params;
  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: { user: true },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.user.is_verified) {
      return res
        .status(400)
        .json({ error: "Expert email is already verified." });
    }

    await prisma.user.update({
      where: { id: expert.user_id },
      data: {
        is_verified: true,
        verification_code: null,
        verification_expires_at: null,
      },
    });

    await logAudit(req.user.id, "MANUAL_VERIFY", "EXPERT", parseInt(id));

    return res.json({ verified: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Tax CSV export ───────────────────────────────────────────────────────────

async function exportTaxData(req, res) {
  const { id } = req.params;
  const year = parseInt(req.query.year);
  if (!year || year < 2000 || year > 2100) {
    return res
      .status(400)
      .json({ error: "Valid year query parameter is required." });
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: { select: { name: true, email: true, created_at: true } },
        business_info: true,
      },
    });
    if (!expert) return res.status(404).json({ error: "Expert not found" });

    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year + 1}-01-01T00:00:00.000Z`);

    const bookings = await prisma.booking.findMany({
      where: {
        expert_id: expert.id,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        scheduled_at: { gte: yearStart, lt: yearEnd },
      },
      include: { service: { select: { title: true } } },
      orderBy: { scheduled_at: "asc" },
    });

    const bi = expert.business_info;
    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const row = (...cols) => cols.map(esc).join(",");
    const line = (...cols) => row(...cols) + "\r\n";

    let csv = "";
    csv += line(`EXPERT TAX REPORT — ${year}`);
    csv += line(`Generated`, new Date().toISOString().split("T")[0]);
    csv += "\r\n";
    csv += line("EXPERT IDENTITY");
    csv += line("Name", "Email", "Joined");
    csv += line(
      expert.user?.name || "",
      expert.user?.email || "",
      expert.user?.created_at
        ? new Date(expert.user.created_at).toISOString().split("T")[0]
        : ""
    );
    csv += "\r\n";
    csv += line("BUSINESS INFORMATION");
    if (bi) {
      csv += line(
        "Entity Type",
        bi.entity_type === "INDIVIDUAL"
          ? "Individual"
          : "Company / Legal Entity"
      );
      csv += line("Full Legal Name", bi.legal_name);
      if (bi.entity_type === "INDIVIDUAL" && bi.date_of_birth) {
        csv += line(
          "Date of Birth",
          new Date(bi.date_of_birth).toISOString().split("T")[0]
        );
      }
      csv += line("Primary Address", bi.primary_address);
      csv += line("TIN", bi.tin);
      if (bi.vat_number) csv += line("VAT Number", bi.vat_number);
      if (bi.company_reg_number)
        csv += line("Company Reg. Number", bi.company_reg_number);
      csv += line("IBAN", bi.iban);
      csv += line("Business Email", bi.business_email);
      csv += line("Website", bi.website);
      if (bi.municipality) csv += line("Municipality", bi.municipality);
      if (bi.business_address)
        csv += line("Business Address", bi.business_address);
    } else {
      csv += line("No business information on file");
    }
    csv += "\r\n";
    csv += line(`PAYMENTS (${year})`);
    csv += line(
      "Date",
      "Service",
      "Duration (min)",
      "Gross Amount (€)",
      "Platform Fee (€)",
      "Net Payout (€)",
      "Status"
    );

    let totalGross = 0;
    let totalFee = 0;
    for (const b of bookings) {
      const gross = parseFloat(b.amount || 0);
      const fee = parseFloat(b.platform_fee || 0);
      totalGross += gross;
      totalFee += fee;
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
    csv += line(
      "Total Bookings",
      "Total Gross (€)",
      "Total Fees (€)",
      "Total Net Payout (€)"
    );
    csv += line(
      bookings.length,
      totalGross.toFixed(2),
      totalFee.toFixed(2),
      (totalGross - totalFee).toFixed(2)
    );

    const safeName = (expert.user?.name || `expert-${id}`)
      .replace(/[^a-z0-9]/gi, "_")
      .toLowerCase();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tax_report_${safeName}_${year}.csv"`
    );
    return res.send("\uFEFF" + csv);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

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
        parent: { select: { name: true, email: true } },
        service: { select: { title: true } },
      },
    });
    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function manualRefund(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  try {
    const booking = await prisma.booking.findUnique({
      where: { id: parseInt(id) },
      include: {
        expert: { select: { id: true } },
        parent: { select: { name: true, email: true } },
        service: { select: { title: true } },
      },
    });

    if (!booking) return res.status(404).json({ error: "Booking not found" });
    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        error: `Booking cannot be refunded (status: ${booking.status})`,
      });
    }
    if (!booking.stripe_payment_intent_id) {
      return res
        .status(400)
        .json({ error: "No payment found for this booking" });
    }

    let chargeId = booking.stripe_charge_id;
    if (!chargeId) {
      const pi = await stripe.paymentIntents.retrieve(
        booking.stripe_payment_intent_id
      );
      chargeId = pi.latest_charge;
    }
    if (!chargeId) {
      return res
        .status(400)
        .json({ error: "Could not locate charge for this booking" });
    }

    await stripe.refunds.create({ charge: chargeId });

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "REFUNDED",
        cancellation_reason: reason || "Admin manual refund",
        cancelled_at: new Date(),
        transfer_status: "skipped",
      },
    });

    await logAudit(
      req.user.id,
      "MANUAL_REFUND",
      "BOOKING",
      booking.id,
      reason || "Admin manual refund"
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[ADMIN] Manual refund error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Legal documents ──────────────────────────────────────────────────────────

async function getLegalDocuments(req, res) {
  try {
    const [pp, tc] = await Promise.all([
      prisma.legalDocument.findFirst({
        where: { type: "PRIVACY_POLICY" },
        orderBy: { effective_from: "desc" },
      }),
      prisma.legalDocument.findFirst({
        where: { type: "TERMS_CONDITIONS" },
        orderBy: { effective_from: "desc" },
      }),
    ]);
    return res.json({ privacy_policy: pp, terms_conditions: tc });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function bumpLegalDocument(req, res) {
  const { type, version } = req.body;

  if (!["PRIVACY_POLICY", "TERMS_CONDITIONS"].includes(type)) {
    return res
      .status(400)
      .json({ error: "type must be PRIVACY_POLICY or TERMS_CONDITIONS" });
  }
  if (!version || typeof version !== "string" || !version.trim()) {
    return res.status(400).json({ error: "version is required" });
  }

  try {
    const existing = await prisma.legalDocument.findUnique({
      where: { type_version: { type, version: version.trim() } },
    });
    if (existing) {
      return res
        .status(409)
        .json({ error: `Version ${version} already exists for ${type}` });
    }

    const doc = await prisma.legalDocument.create({
      data: { type, version: version.trim() },
    });

    console.log(
      `[ADMIN] Legal document bumped: ${type} → v${version} by admin ${req.user?.id}`
    );
    return res.status(201).json(doc);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Audit log ────────────────────────────────────────────────────────────────

async function getAuditLog(req, res) {
  const { entityId, entityType } = req.query;
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = 20;
  const skip = (page - 1) * limit;

  if (!entityId) return res.status(400).json({ error: "entityId is required" });

  const where = { entity_id: parseInt(entityId) };
  if (entityType) where.entity_type = entityType;

  try {
    const [total, logs] = await Promise.all([
      prisma.adminAuditLog.count({ where }),
      prisma.adminAuditLog.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
    ]);

    // Attach admin names via a second query (no FK relation — intentional)
    const adminIds = [...new Set(logs.map((l) => l.admin_id))];
    const admins = adminIds.length
      ? await prisma.user.findMany({
          where: { id: { in: adminIds } },
          select: { id: true, name: true },
        })
      : [];
    const adminMap = Object.fromEntries(admins.map((a) => [a.id, a.name]));

    const enriched = logs.map((l) => ({
      ...l,
      admin_name: adminMap[l.admin_id] || "Unknown",
    }));

    return res.json({
      data: enriched,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── GDPR deletion ────────────────────────────────────────────────────────────
// Admin-triggered erasure per GDPR Art. 17.
// Personal data wiped immediately. Booking records retained in anonymised form
// under Art. 17(3)(b) (accounting / legal obligation exemption).

async function gdprDeleteExpert(req, res) {
  const { id } = req.params;
  const { confirm_email } = req.body;

  if (!confirm_email || !confirm_email.trim()) {
    return res.status(400).json({ error: "confirm_email is required." });
  }

  try {
    const expert = await prisma.expert.findUnique({
      where: { id: parseInt(id) },
      include: {
        user: true,
        qualifications: true,
        certifications: true,
        insurance: true,
        business_info: true,
        bookings: {
          where: {
            status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
            scheduled_at: { gt: new Date() },
          },
        },
      },
    });

    if (!expert) return res.status(404).json({ error: "Expert not found" });

    if (expert.user.account_deleted) {
      return res
        .status(400)
        .json({ error: "This account has already been deleted." });
    }

    // Admin must type the expert's exact email to confirm they have the right account
    if (
      confirm_email.trim().toLowerCase() !== expert.user.email.toLowerCase()
    ) {
      return res.status(400).json({
        error: "Email confirmation does not match this expert's account.",
      });
    }

    // ── 1. Cancel future bookings and refund where payment was captured ────────
    for (const booking of expert.bookings) {
      try {
        if (
          booking.status === "CONFIRMED" &&
          booking.stripe_payment_intent_id
        ) {
          let chargeId = booking.stripe_charge_id;
          if (!chargeId) {
            const pi = await stripe.paymentIntents.retrieve(
              booking.stripe_payment_intent_id
            );
            chargeId = pi.latest_charge;
          }
          if (chargeId) {
            await stripe.refunds.create({ charge: chargeId });
          }
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: "REFUNDED",
              cancellation_reason: "Specialist account deleted (GDPR)",
              cancelled_at: new Date(),
              transfer_status: "skipped",
            },
          });
        } else if (booking.status === "PENDING_PAYMENT") {
          // No charge yet — cancel the PaymentIntent if present
          if (booking.stripe_payment_intent_id) {
            try {
              await stripe.paymentIntents.cancel(
                booking.stripe_payment_intent_id
              );
            } catch (_) {
              /* may already be expired — safe to ignore */
            }
          }
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: "CANCELLED",
              cancellation_reason: "Specialist account deleted (GDPR)",
              cancelled_at: new Date(),
            },
          });
        }
      } catch (refundErr) {
        // Log but never abort the deletion — GDPR obligation > refund convenience
        console.error(
          `[GDPR] Failed to process booking ${booking.id}:`,
          refundErr.message
        );
      }
    }

    // ── 2. Skip any pending transfers for this expert (can't pay deleted account) ─
    await prisma.booking.updateMany({
      where: { expert_id: expert.id, transfer_status: "pending" },
      data: { transfer_status: "skipped" },
    });

    // ── 3. Delete uploaded files ───────────────────────────────────────────────
    const filesToDelete = [
      expert.profile_image,
      ...expert.qualifications.map((q) => q.document_url),
      ...expert.certifications.map((c) => c.document_url),
      ...(expert.insurance ? [expert.insurance.document_url] : []),
    ].filter(Boolean);

    for (const fileUrl of filesToDelete) {
      deleteFile(fileUrl);
    }

    // ── 4. Delete BusinessInfo (pure PII — no accounting value) ───────────────
    if (expert.business_info) {
      await prisma.businessInfo.delete({ where: { expert_id: expert.id } });
    }

    // ── 5. Anonymise Expert record ─────────────────────────────────────────────
    await prisma.expert.update({
      where: { id: expert.id },
      data: {
        bio: null,
        profile_image: null,
        expertise: null,
        stripe_account_id: null,
        stripe_onboarding_complete: false,
        status: "SUSPENDED",
        is_published: false,
        summary: null,
        position: null,
        session_format: null,
        address_street: null,
        address_city: null,
        address_postcode: null,
        languages: [],
        instagram: null,
        facebook: null,
        linkedin: null,
        change_request_note: null,
        change_requested_at: null,
      },
    });

    // ── 6. Anonymise User record ───────────────────────────────────────────────
    await prisma.user.update({
      where: { id: expert.user_id },
      data: {
        name: "Deleted User",
        email: `deleted_${expert.user_id}_${Date.now()}@erasure.local`,
        phone: null,
        password_hash: null,
        is_verified: false,
        verification_code: null,
        verification_expires_at: null,
        reset_token: null,
        reset_token_expires_at: null,
        account_deleted: true,
      },
    });

    // ── 7. Invalidate all sessions ─────────────────────────────────────────────
    await prisma.refreshToken.deleteMany({
      where: { user_id: expert.user_id },
    });

    // ── 8. Audit log (written after wipe — uses expert.id which still exists) ──
    await logAudit(
      req.user.id,
      "GDPR_DELETE",
      "EXPERT",
      expert.id,
      `Account erased. User ID: ${
        expert.user_id
      }. Confirmed by: ${confirm_email.trim()}`
    );

    console.log(
      `[GDPR] Expert ${id} (User ${expert.user_id}) erased by admin ${req.user.id}`
    );

    return res.json({ deleted: true });
  } catch (err) {
    console.error("[GDPR] Expert deletion failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Parent list ──────────────────────────────────────────────────────────────

async function listParents(req, res) {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(
    100,
    Math.max(1, parseInt(req.query.limit) || PAGE_LIMIT)
  );
  const skip = (page - 1) * limit;
  const { status, search, from, to } = req.query;

  // null parent_status is treated as ACTIVE (pre-migration rows)
  const baseWhere = { role: "PARENT", account_deleted: false };
  const where = { ...baseWhere };
  const andConditions = [];

  if (status && ["ACTIVE", "DEACTIVATED", "SUSPENDED"].includes(status)) {
    if (status === "ACTIVE") {
      // Prisma doesn't allow null in an `in` array for enums — use OR instead
      andConditions.push({ OR: [{ parent_status: "ACTIVE" }, { parent_status: null }] });
    } else {
      where.parent_status = status;
    }
  }
  if (search?.trim()) {
    andConditions.push({
      OR: [
        { name:  { contains: search.trim(), mode: "insensitive" } },
        { email: { contains: search.trim(), mode: "insensitive" } },
      ],
    });
  }
  if (from || to) {
    where.created_at = {};
    if (from) where.created_at.gte = new Date(from);
    if (to)   where.created_at.lte = new Date(to + "T23:59:59.999Z");
  }
  if (andConditions.length > 0) where.AND = andConditions;

  try {
    const [total, data, activeCount, deactivatedCount, suspendedCount] =
      await Promise.all([
        prisma.user.count({ where }),
        prisma.user.findMany({
          where,
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            created_at: true,
            is_verified: true,
            parent_status: true,
            _count: { select: { bookings_as_parent: true } },
          },
          orderBy: { created_at: "desc" },
          skip,
          take: limit,
        }),
        // null = ACTIVE for count (Prisma doesn't allow null in enum `in` — use OR)
        prisma.user.count({
          where: { ...baseWhere, AND: [{ OR: [{ parent_status: "ACTIVE" }, { parent_status: null }] }] },
        }),
        prisma.user.count({
          where: { ...baseWhere, parent_status: "DEACTIVATED" },
        }),
        prisma.user.count({
          where: { ...baseWhere, parent_status: "SUSPENDED" },
        }),
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
        all: activeCount + deactivatedCount + suspendedCount,
        ACTIVE: activeCount,
        DEACTIVATED: deactivatedCount,
        SUSPENDED: suspendedCount,
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Parent bookings ───────────────────────────────────────────────────────────

async function listParentBookings(req, res) {
  const { id } = req.params;
  try {
    const bookings = await prisma.booking.findMany({
      where: { parent_id: parseInt(id) },
      orderBy: { scheduled_at: "desc" },
      take: 50,
      include: {
        service: {
          select: { title: true, duration_minutes: true, price: true },
        },
        expert: { select: { user: { select: { name: true } } } },
      },
    });
    return res.json(bookings);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Parent status actions ─────────────────────────────────────────────────────

async function activateParent(req, res) {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user || user.role !== "PARENT")
      return res.status(404).json({ error: "Parent not found" });
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { parent_status: "ACTIVE" },
    });
    await logAudit(req.user.id, "ACTIVATE_PARENT", "PARENT", parseInt(id));
    return res.json({ message: "Parent account activated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function deactivateParent(req, res) {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user || user.role !== "PARENT")
      return res.status(404).json({ error: "Parent not found" });
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { parent_status: "DEACTIVATED" },
    });
    await logAudit(req.user.id, "DEACTIVATE_PARENT", "PARENT", parseInt(id));
    return res.json({ message: "Parent account deactivated" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function suspendParent(req, res) {
  const { id } = req.params;
  try {
    const user = await prisma.user.findUnique({ where: { id: parseInt(id) } });
    if (!user || user.role !== "PARENT")
      return res.status(404).json({ error: "Parent not found" });
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: { parent_status: "SUSPENDED" },
    });
    // Immediately invalidate all active sessions
    await prisma.refreshToken.deleteMany({ where: { user_id: parseInt(id) } });
    await logAudit(req.user.id, "SUSPEND_PARENT", "PARENT", parseInt(id));
    return res.json({ message: "Parent account suspended" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Parent GDPR deletion ──────────────────────────────────────────────────────

async function gdprDeleteParent(req, res) {
  const { id } = req.params;
  const { confirm_email } = req.body;

  if (!confirm_email?.trim()) {
    return res.status(400).json({ error: "confirm_email is required." });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(id) },
      include: {
        bookings_as_parent: {
          where: {
            status: { in: ["PENDING_PAYMENT", "CONFIRMED"] },
            scheduled_at: { gt: new Date() },
          },
        },
      },
    });

    if (!user || user.role !== "PARENT")
      return res.status(404).json({ error: "Parent not found" });
    if (user.account_deleted)
      return res
        .status(400)
        .json({ error: "This account has already been deleted." });
    if (confirm_email.trim().toLowerCase() !== user.email.toLowerCase()) {
      return res.status(400).json({
        error: "Email confirmation does not match this parent's account.",
      });
    }

    // ── 1. Cancel future bookings + refund captured payments ──────────────────
    for (const booking of user.bookings_as_parent) {
      try {
        if (
          booking.status === "CONFIRMED" &&
          booking.stripe_payment_intent_id
        ) {
          let chargeId = booking.stripe_charge_id;
          if (!chargeId) {
            const pi = await stripe.paymentIntents.retrieve(
              booking.stripe_payment_intent_id
            );
            chargeId = pi.latest_charge;
          }
          if (chargeId) await stripe.refunds.create({ charge: chargeId });
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: "REFUNDED",
              cancellation_reason: "Parent account deleted (GDPR)",
              cancelled_at: new Date(),
              transfer_status: "skipped",
            },
          });
        } else if (booking.status === "PENDING_PAYMENT") {
          if (booking.stripe_payment_intent_id) {
            try {
              await stripe.paymentIntents.cancel(
                booking.stripe_payment_intent_id
              );
            } catch (_) {}
          }
          await prisma.booking.update({
            where: { id: booking.id },
            data: {
              status: "CANCELLED",
              cancellation_reason: "Parent account deleted (GDPR)",
              cancelled_at: new Date(),
            },
          });
        }
      } catch (refundErr) {
        console.error(
          `[GDPR] Failed to process booking ${booking.id}:`,
          refundErr.message
        );
      }
    }

    // ── 2. Anonymise User record ───────────────────────────────────────────────
    const ts = Date.now();
    await prisma.user.update({
      where: { id: parseInt(id) },
      data: {
        name: "Deleted User",
        email: `deleted_${id}_${ts}@erasure.local`,
        phone: null,
        password_hash: null,
        verification_code: null,
        reset_token: null,
        account_deleted: true,
        parent_status: null,
      },
    });

    // ── 3. Invalidate all sessions ─────────────────────────────────────────────
    await prisma.refreshToken.deleteMany({ where: { user_id: parseInt(id) } });

    // ── 4. Log audit ───────────────────────────────────────────────────────────
    await logAudit(
      req.user.id,
      "GDPR_DELETE_PARENT",
      "PARENT",
      parseInt(id),
      `Account erased. Confirmed by: ${confirm_email.trim()}`
    );

    console.log(`[GDPR] Parent ${id} erased by admin ${req.user.id}`);
    return res.json({ deleted: true });
  } catch (err) {
    console.error("[GDPR] Parent deletion failed:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

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
  requestChanges,
  unpublishExpert,
  republishExpert,
  exportTaxData,
  listExpertBookings,
  manualRefund,
  getLegalDocuments,
  bumpLegalDocument,
  getAuditLog,
  gdprDeleteExpert,
  listParents,
  listParentBookings,
  activateParent,
  deactivateParent,
  suspendParent,
  gdprDeleteParent,
};
