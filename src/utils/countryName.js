// Locale-aware country name from an ISO-3166-1 alpha-2 code (the lowercase
// form stored on Expert.address_country / BusinessInfo.address_country).
// Mirrors the frontend helper in src/utils/countries.js — uses Intl.DisplayNames
// (available in the Node runtime) and falls back to the upper-cased code.
function countryName(code, language = 'en') {
  if (!code) return '';
  const lng = language === 'it' ? 'it' : 'en';
  try {
    const name = new Intl.DisplayNames([lng], { type: 'region' }).of(code.toUpperCase());
    if (name && name !== code.toUpperCase()) return name;
  } catch { /* Intl.DisplayNames unavailable — fall through */ }
  return code.toUpperCase();
}

// Expert practice-address line shown to parents/experts for in-person sessions.
// country falls back to the registered/DAC7 country when the practice country
// has not been set yet (rows created between the backfill migration and the
// profile-form change).
function practiceAddressLine(expert, language = 'en') {
  if (!expert) return '';
  const country = expert.address_country || expert.business_info?.address_country || null;
  return [
    expert.address_street,
    expert.address_city,
    expert.address_postcode,
    countryName(country, language),
  ].filter(Boolean).join(', ');
}

module.exports = { countryName, practiceAddressLine };
