const prisma = require("../prisma/client");

// Static in-app pages, kept only as an ultimate fallback for the rare case a
// legal document type has never had a PDF published yet. No /it/ variant of
// these routes exists in the frontend, so the IT fallback also points at the
// English static page.
const STATIC_FALLBACK_PATH = {
  TERMS_CONDITIONS: "/terms-conditions",
  CANCELLATION_POLICY: "/cancellation-policy",
  PRIVACY_POLICY: "/privacy-policy",
};

function resolveUrl(doc, language, type) {
  const preferred = language === "it" ? doc?.file_url_it : doc?.file_url_en;
  return preferred || doc?.file_url_en || doc?.file_url_it || `${process.env.CLIENT_URL}${STATIC_FALLBACK_PATH[type]}`;
}

/**
 * Resolves the live, Bunny-hosted PDF URLs for the three consumer legal
 * documents, in the given language — the same source (`LegalDocument`) that
 * backs the admin CMS and the `getLegalVersions` endpoint used at checkout,
 * so an email link always points at whatever version was actually current.
 */
async function getLegalDocLinks(language) {
  const select = { file_url_en: true, file_url_it: true };
  const [tc, cp, pp] = await Promise.all([
    prisma.legalDocument.findFirst({ where: { type: "TERMS_CONDITIONS" }, orderBy: { effective_from: "desc" }, select }),
    prisma.legalDocument.findFirst({ where: { type: "CANCELLATION_POLICY" }, orderBy: { effective_from: "desc" }, select }),
    prisma.legalDocument.findFirst({ where: { type: "PRIVACY_POLICY" }, orderBy: { effective_from: "desc" }, select }),
  ]);

  return {
    termsUrl: resolveUrl(tc, language, "TERMS_CONDITIONS"),
    policyUrl: resolveUrl(cp, language, "CANCELLATION_POLICY"),
    privacyUrl: resolveUrl(pp, language, "PRIVACY_POLICY"),
  };
}

module.exports = { getLegalDocLinks };
