const argon2 = require("argon2");
const bcrypt = require("bcrypt"); // kept only for verifying legacy hashes during transition
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const path = require("path");
const fs = require("fs");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const prisma = require("../prisma/client");

const UPLOADS_DIR = path.join(__dirname, "../../uploads");

function deleteFile(fileUrl) {
  if (!fileUrl || !fileUrl.startsWith("/uploads/")) return;
  const filePath = path.join(UPLOADS_DIR, path.basename(fileUrl));
  if (fs.existsSync(filePath)) {
    try { fs.unlinkSync(filePath); } catch (_) {}
  }
}
const {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendAccountLockedEmail,
  sendEmailChangeVerification,
} = require("../utils/email");

const ACCESS_TOKEN_EXPIRES = "15m";
const REFRESH_TOKEN_EXPIRES_MS = 30 * 24 * 60 * 60 * 1000; // 30 days (sliding via rotation)
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// Argon2id — OWASP recommended settings (64 MB memory cost)
const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 65536, // 64 MB in KB
  timeCost: 3,
  parallelism: 1,
};

async function hashPassword(password) {
  return argon2.hash(password, ARGON2_OPTIONS);
}

// Hybrid verify: supports existing bcrypt hashes transparently during transition
async function verifyPassword(hash, password) {
  if (hash.startsWith("$2b$") || hash.startsWith("$2a$")) {
    return bcrypt.compare(password, hash);
  }
  return argon2.verify(hash, password);
}

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(64).toString("hex");
}

async function storeRefreshToken(userId, token) {
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_MS);
  await prisma.refreshToken.create({
    data: { token, user_id: userId, expires_at: expiresAt },
  });
}

function userPayload(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// ─── Password strength validator ─────────────────────────────────────────────
function validatePasswordStrength(password) {
  if (!password || password.length < 8)      return "Password must be at least 8 characters.";
  if (!/[A-Z]/.test(password))               return "Password must contain at least one uppercase letter.";
  if (!/[a-z]/.test(password))               return "Password must contain at least one lowercase letter.";
  if (!/[0-9]/.test(password))               return "Password must contain at least one number.";
  if (!/[^a-zA-Z0-9]/.test(password))        return "Password must contain at least one special character (e.g. !, @, #, $).";
  return null;
}

// ─── Register ───────────────────────────────────────────────────────────────
async function register(req, res) {
  const { email, password, role, name, phone, privacyPolicyAccepted, marketingConsent } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // GDPR hard block — server-side enforcement (client-side alone is not sufficient)
  if (privacyPolicyAccepted !== true) {
    return res.status(400).json({ error: "You must accept the Privacy Policy to create an account." });
  }

  const pwError = validatePasswordStrength(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: "Email already registered" });
    }

    const password_hash = await hashPassword(password);
    const assignedRole = ["EXPERT", "PARENT"].includes(role) ? role : "EXPERT";

    // Both EXPERTs and PARENTs require email verification before login
    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await prisma.user.create({
      data: {
        email,
        name,
        phone: phone || null,
        password_hash,
        role: assignedRole,
        is_verified: false,
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
      },
    });

    if (assignedRole === "EXPERT") {
      await prisma.expert.create({ data: { user_id: user.id } });
    }

    // Store Privacy Policy acceptance (GDPR requirement)
    const currentPp = await prisma.legalDocument.findFirst({
      where: { type: "PRIVACY_POLICY" },
      orderBy: { effective_from: "desc" },
    });
    await prisma.privacyPolicyAcceptance.create({
      data: {
        user_id: user.id,
        version: currentPp?.version ?? "1.0",
        marketing_consent: marketingConsent === true,
        marketing_accepted_at: marketingConsent === true ? new Date() : null,
      },
    });

    sendVerificationEmail({
      to: user.email,
      name: user.name,
      userId: user.id,
      verificationCode,
    }).catch((err) =>
      console.error("Failed to send verification email:", err.message)
    );

    return res.status(201).json({
      verification_email_sent: true,
      email: user.email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Verify Email ────────────────────────────────────────────────────────────
async function verifyEmail(req, res) {
  const { userId, verificationCode } = req.body;

  if (!userId || !verificationCode) {
    return res.status(400).json({ error: "userId and verificationCode are required" });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: Number(userId) },
    });

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.is_verified) {
      return res.json({ already_verified: true });
    }

    if (
      user.verification_expires_at &&
      new Date() > user.verification_expires_at
    ) {
      return res.status(410).json({
        error: "Verification link has expired. Please register again.",
        expired: true,
      });
    }

    if (user.verification_code !== verificationCode) {
      return res.status(400).json({ error: "Invalid verification link." });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        is_verified: true,
        verification_code: null,
        verification_expires_at: null,
      },
    });

    return res.json({ verified: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Login ───────────────────────────────────────────────────────────────────
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Generic error used for all credential failures — prevents account enumeration
  const INVALID_CREDENTIALS_ERROR = "Invalid email or password.";

  try {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { expert: { select: { status: true } } },
    });

    // Return the same generic error whether the email exists or not
    if (!user) {
      return res.status(401).json({ error: INVALID_CREDENTIALS_ERROR });
    }

    // OAuth-only accounts have no password
    if (!user.password_hash) {
      return res.status(401).json({
        error: "This account uses social login. Please sign in with Google or Apple.",
      });
    }

    // Account lockout check
    if (user.locked_until && new Date() < user.locked_until) {
      const minutesLeft = Math.ceil((user.locked_until - Date.now()) / 60000);
      return res.status(423).json({
        error: `Account locked due to too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? "s" : ""}.`,
        locked: true,
      });
    }

    const valid = await verifyPassword(user.password_hash, password);

    if (!valid) {
      const attempts = user.login_attempts + 1;

      if (attempts >= MAX_LOGIN_ATTEMPTS) {
        // Lock the account for 30 minutes
        const lockedUntil = new Date(Date.now() + LOCKOUT_DURATION_MS);
        await prisma.user.update({
          where: { id: user.id },
          data: { login_attempts: attempts, locked_until: lockedUntil },
        });

        // Notify the account owner by email (fire-and-forget)
        sendAccountLockedEmail({
          to: user.email,
          name: user.name,
          unlockAt: lockedUntil,
        }).catch((err) =>
          console.error("Failed to send account locked email:", err.message)
        );

        return res.status(423).json({
          error: "Account locked due to too many failed attempts. Try again in 30 minutes.",
          locked: true,
        });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { login_attempts: attempts },
      });

      return res.status(401).json({ error: INVALID_CREDENTIALS_ERROR });
    }

    // Credentials valid — check email verification (applies to both PARENT and EXPERT)
    if (!user.is_verified) {
      return res.status(403).json({
        error: "Please verify your email address before logging in.",
        email_not_verified: true,
        email: user.email,
      });
    }

    if (user.role === "EXPERT" && user.expert?.status === "SUSPENDED") {
      return res.status(403).json({
        error: "Your account has been suspended. Please contact support.",
        account_suspended: true,
      });
    }

    if (user.role === "PARENT" && user.parent_status && user.parent_status !== "ACTIVE") {
      return res.status(403).json({
        error: user.parent_status === "SUSPENDED"
          ? "Your account has been suspended. Please contact support."
          : "Your account has been deactivated. Please contact support.",
        account_suspended: user.parent_status === "SUSPENDED",
      });
    }

    // Reset failed attempts on successful login
    await prisma.user.update({
      where: { id: user.id },
      data: { login_attempts: 0, locked_until: null },
    });

    // Transparent hash upgrade: if stored hash is bcrypt, re-hash with argon2id
    if (user.password_hash.startsWith("$2b$") || user.password_hash.startsWith("$2a$")) {
      const newHash = await hashPassword(password);
      await prisma.user.update({
        where: { id: user.id },
        data: { password_hash: newHash },
      });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, refreshToken);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: REFRESH_TOKEN_EXPIRES_MS,
    });

    // Check if parent needs to re-accept an updated Privacy Policy
    let ppUpdateRequired = false;
    if (user.role === "PARENT") {
      const [currentPp, lastAccepted] = await Promise.all([
        prisma.legalDocument.findFirst({
          where: { type: "PRIVACY_POLICY" },
          orderBy: { effective_from: "desc" },
        }),
        prisma.privacyPolicyAcceptance.findFirst({
          where: { user_id: user.id },
          orderBy: { accepted_at: "desc" },
        }),
      ]);
      if (currentPp && (!lastAccepted || lastAccepted.version !== currentPp.version)) {
        ppUpdateRequired = true;
      }
    }

    return res.json({
      accessToken,
      user: userPayload(user),
      ...(ppUpdateRequired && { pp_update_required: true }),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Refresh ─────────────────────────────────────────────────────────────────
async function refresh(req, res) {
  console.log('[refresh] cookies received:', req.cookies);
  console.log('[refresh] headers origin:', req.headers.origin);
  const refreshToken = req.cookies?.refreshToken;

  if (!refreshToken) {
    console.log('[refresh] No refreshToken cookie found');
    return res.status(401).json({ error: "Refresh token required" });
  }

  try {
    const stored = await prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    });

    if (!stored || new Date() > stored.expires_at) {
      if (stored) {
        await prisma.refreshToken.delete({ where: { token: refreshToken } });
      }
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    // Rotate: delete old, issue new
    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    const user = await prisma.user.findUnique({ where: { id: stored.user_id } });
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken();
    await storeRefreshToken(user.id, newRefreshToken);

    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
      maxAge: REFRESH_TOKEN_EXPIRES_MS,
    });

    return res.json({
      accessToken: newAccessToken,
      user: userPayload(user),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Logout ──────────────────────────────────────────────────────────────────
async function logout(req, res) {
  const refreshToken = req.cookies?.refreshToken;

  if (refreshToken) {
    try {
      await prisma.refreshToken.delete({ where: { token: refreshToken } });
    } catch {
      // Token may already be gone — that's fine
    }
  }

  res.clearCookie("refreshToken", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
  });

  return res.json({ message: "Logged out successfully" });
}

// ─── Resend Verification Email ────────────────────────────────────────────────
async function resendVerification(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Silently succeed if user not found or already verified (prevents enumeration)
    if (!user || user.is_verified) {
      return res.json({ sent: true });
    }

    // Server-side cooldown: block if last email was sent < 60 seconds ago
    if (user.verification_expires_at) {
      const cooldownThreshold = new Date(Date.now() + (24 * 60 - 1) * 60 * 1000);
      if (user.verification_expires_at > cooldownThreshold) {
        return res.status(429).json({ error: "Please wait a moment before requesting another email." });
      }
    }

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
      },
    });

    sendVerificationEmail({
      to: user.email,
      name: user.name,
      userId: user.id,
      verificationCode,
    }).catch((err) =>
      console.error("Failed to resend verification email:", err.message)
    );

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Forgot Password ──────────────────────────────────────────────────────────
async function forgotPassword(req, res) {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "Email is required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success — prevents enumeration of registered emails
    if (!user) {
      return res.json({ sent: true });
    }

    // Server-side cooldown: block if a token was issued < 1 minute ago
    if (user.reset_token_expires_at) {
      const cooldownThreshold = new Date(Date.now() + (60 * 60 - 60) * 1000);
      if (user.reset_token_expires_at > cooldownThreshold) {
        return res.status(429).json({ error: "Please wait before requesting another reset email." });
      }
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const resetTokenExpiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.user.update({
      where: { id: user.id },
      data: { reset_token: resetToken, reset_token_expires_at: resetTokenExpiresAt },
    });

    sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetToken,
    }).catch((err) =>
      console.error("Failed to send password reset email:", err.message)
    );

    return res.json({ sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Reset Password ───────────────────────────────────────────────────────────
async function resetPassword(req, res) {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ error: "Token and new password are required" });
  }
  const pwError = validatePasswordStrength(password);
  if (pwError) return res.status(400).json({ error: pwError });

  try {
    const user = await prisma.user.findFirst({ where: { reset_token: token } });

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset link." });
    }

    if (new Date() > user.reset_token_expires_at) {
      await prisma.user.update({
        where: { id: user.id },
        data: { reset_token: null, reset_token_expires_at: null },
      });
      return res.status(410).json({
        error: "This reset link has expired. Please request a new one.",
        expired: true,
      });
    }

    const password_hash = await hashPassword(password);

    await prisma.user.update({
      where: { id: user.id },
      data: { password_hash, reset_token: null, reset_token_expires_at: null },
    });

    // Invalidate all active sessions for security
    await prisma.refreshToken.deleteMany({ where: { user_id: user.id } });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Get Profile ──────────────────────────────────────────────────────────────
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, name: true, email: true, phone: true, is_verified: true, role: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Update Profile (name + phone) ────────────────────────────────────────────
async function updateProfile(req, res) {
  const { name, phone } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Name is required" });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: name.trim(), phone: phone?.trim() || null },
      select: { id: true, name: true, email: true, phone: true, role: true },
    });
    return res.json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Update Email — triggers re-verification ─────────────────────────────────
async function updateEmail(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "New email and current password are required" });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    // Confirm identity before sensitive change
    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    // No-op if email unchanged
    if (email.toLowerCase() === user.email.toLowerCase()) {
      return res.status(400).json({ error: "This is already your current email address" });
    }

    // Check the new address isn't taken
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: "Email already in use" });

    const verificationCode = crypto.randomBytes(32).toString("hex");
    const verificationExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        email,
        is_verified: false,
        verification_code: verificationCode,
        verification_expires_at: verificationExpiresAt,
      },
    });

    // Invalidate all sessions — user must re-login after verifying new email
    await prisma.refreshToken.deleteMany({ where: { user_id: req.user.id } });

    sendEmailChangeVerification({
      to: email,
      name: user.name,
      userId: user.id,
      verificationCode,
    }).catch((err) => console.error("Failed to send email change verification:", err.message));

    return res.json({ email_change_sent: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Change Password ──────────────────────────────────────────────────────────
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password are required" });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: "New password must be at least 6 characters" });
  }
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: "New password must be different from your current password" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await verifyPassword(user.password_hash, currentPassword);
    if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

    const password_hash = await hashPassword(newPassword);

    await prisma.user.update({
      where: { id: req.user.id },
      data: { password_hash },
    });

    // Invalidate all other sessions — user keeps current session via new token issued by client
    await prisma.refreshToken.deleteMany({ where: { user_id: req.user.id } });

    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Delete Account (GDPR right to erasure) ───────────────────────────────────
// Personal data is wiped immediately. Booking records are retained in anonymised
// form for accounting purposes as permitted under GDPR Art. 17(3)(b).
async function deleteAccount(req, res) {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({ error: "Password confirmation is required" });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: "User not found" });

    const valid = await verifyPassword(user.password_hash, password);
    if (!valid) return res.status(401).json({ error: "Password is incorrect" });

    // ── Expert cleanup (only if this user has an expert profile) ──────────────
    const expert = await prisma.expert.findUnique({
      where: { user_id: req.user.id },
      include: {
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

    if (expert) {
      // 1. Cancel future bookings and refund where payment was captured
      for (const booking of expert.bookings) {
        try {
          if (booking.status === "CONFIRMED" && booking.stripe_payment_intent_id) {
            let chargeId = booking.stripe_charge_id;
            if (!chargeId) {
              const pi = await stripe.paymentIntents.retrieve(booking.stripe_payment_intent_id);
              chargeId = pi.latest_charge;
            }
            if (chargeId) await stripe.refunds.create({ charge: chargeId });
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
            if (booking.stripe_payment_intent_id) {
              try { await stripe.paymentIntents.cancel(booking.stripe_payment_intent_id); } catch (_) {}
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
          console.error(`[GDPR] Failed to process booking ${booking.id}:`, refundErr.message);
        }
      }

      // 2. Skip any pending transfers (can't pay a deleted account)
      await prisma.booking.updateMany({
        where: { expert_id: expert.id, transfer_status: "pending" },
        data: { transfer_status: "skipped" },
      });

      // 3. Delete uploaded files
      const filesToDelete = [
        expert.profile_image,
        ...expert.qualifications.map((q) => q.document_url),
        ...expert.certifications.map((c) => c.document_url),
        ...(expert.insurance ? [expert.insurance.document_url] : []),
      ].filter(Boolean);
      for (const fileUrl of filesToDelete) deleteFile(fileUrl);

      // 4. Hard-delete BusinessInfo (pure PII — no accounting value)
      if (expert.business_info) {
        await prisma.businessInfo.delete({ where: { expert_id: expert.id } });
      }

      // 5. Anonymise Expert record
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

      console.log(`[GDPR] Expert profile ${expert.id} anonymised during self-deletion`);
    }

    // Wipe all personal data immediately
    await prisma.user.update({
      where: { id: req.user.id },
      data: {
        name:                     "Deleted User",
        email:                    `deleted_${req.user.id}_${Date.now()}@erasure.local`,
        phone:                    null,
        password_hash:            null,
        is_verified:              false,
        verification_code:        null,
        verification_expires_at:  null,
        reset_token:              null,
        reset_token_expires_at:   null,
        account_deleted:          true,
      },
    });

    // Invalidate all sessions
    await prisma.refreshToken.deleteMany({ where: { user_id: req.user.id } });

    console.log(`[GDPR] Account ${req.user.id} erased — personal data wiped`);

    return res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ─── Accept Updated Privacy Policy ───────────────────────────────────────────
async function acceptPrivacyPolicy(req, res) {
  try {
    const currentPp = await prisma.legalDocument.findFirst({
      where: { type: "PRIVACY_POLICY" },
      orderBy: { effective_from: "desc" },
    });
    if (!currentPp) {
      return res.status(500).json({ error: "Privacy Policy document not found" });
    }

    await prisma.privacyPolicyAcceptance.create({
      data: {
        user_id: req.user.id,
        version: currentPp.version,
      },
    });

    return res.json({ accepted: true, version: currentPp.version });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
  getProfile,
  updateProfile,
  updateEmail,
  changePassword,
  deleteAccount,
  acceptPrivacyPolicy,
};
