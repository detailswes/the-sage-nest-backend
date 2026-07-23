const prisma = require("../prisma/client");
const { addOrUpdateBrevoContact, removeBrevoContactFromList } = require("./brevo");

// Canonical marketing opt-in statement — stored verbatim alongside consent so
// the exact text shown to the user is demonstrable under GDPR Art. 7(1) and
// the Danish Markedsføringslov. Increment version when the statement changes.
const MARKETING_CONSENT_VERSION = "v1";
const MARKETING_CONSENT_STATEMENT =
  "I'd like to receive tips, expert advice, and updates from Sage Nest by email. You can unsubscribe at any time.";

// Upsert the single, decoupled marketing-consent record for a user. Mirrors
// the previous PrivacyPolicyAcceptance-embedded semantics: the original grant
// timestamp is preserved through a withdrawal (never nulled), so "first ever
// opted in" survives repeated opt-in/opt-out cycles. `client` may be the base
// `prisma` client or a `$transaction` callback's `tx`.
async function upsertMarketingConsent(client, userId, { consent, source }) {
  const now = new Date();
  const text = `${MARKETING_CONSENT_VERSION}: ${MARKETING_CONSENT_STATEMENT}`;
  return client.marketingConsent.upsert({
    where: { user_id: userId },
    create: {
      user_id: userId,
      consent,
      consent_text: consent ? text : null,
      accepted_at: consent ? now : null,
      withdrawn_at: consent ? null : now,
      source,
    },
    update: {
      consent,
      source,
      ...(consent
        ? { consent_text: text, accepted_at: now, withdrawn_at: null }
        : { withdrawn_at: now }),
    },
  });
}

// Fire-and-forget Brevo sync — parents only, never throws (caller does not await).
function syncMarketingConsentToBrevo(userId, consent) {
  prisma.user
    .findUnique({ where: { id: userId }, select: { email: true, name: true, role: true } })
    .then((user) => {
      if (!user || user.role !== "PARENT") return;
      if (consent) {
        return addOrUpdateBrevoContact({ email: user.email, name: user.name, marketingConsent: true });
      }
      return Promise.all([
        addOrUpdateBrevoContact({ email: user.email, name: user.name, marketingConsent: false }),
        removeBrevoContactFromList(user.email),
      ]);
    })
    .catch((err) => console.error("[Brevo] Marketing consent sync failed:", err.message));
}

module.exports = {
  MARKETING_CONSENT_VERSION,
  MARKETING_CONSENT_STATEMENT,
  upsertMarketingConsent,
  syncMarketingConsentToBrevo,
};
