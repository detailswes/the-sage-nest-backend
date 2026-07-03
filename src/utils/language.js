const SUPPORTED_CONSENT_LANGUAGES = ["en", "it"];

function normalizeConsentLanguage(language) {
  return SUPPORTED_CONSENT_LANGUAGES.includes(language) ? language : "en";
}

module.exports = { SUPPORTED_CONSENT_LANGUAGES, normalizeConsentLanguage };
