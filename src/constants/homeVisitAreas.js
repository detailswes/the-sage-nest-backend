// Server-side validation for the home-visit area picker. Experts choose a
// region and then a province (Italy) / landsdel (Denmark) / county (UK) from
// a fixed dataset; each pair is stored in Service.home_visit_areas as
// "Region — Sub".
//
// The dataset keeps these second-level concepts under different keys
// ("provinces" vs "landsdele" vs "counties") on purpose — they are not
// equivalent — so the helpers here read whichever one a region entry carries.

const data = require('./location-data.json');

// Expert.address_country (practice address) is a lowercase ISO 3166-1 alpha-2 code.
const ISO_TO_COUNTRY_KEY = {
  it: 'italy',
  dk: 'denmark',
  gb: 'united_kingdom',
};

// Spaced em dash — never present inside a region or province name.
const AREA_SEPARATOR = ' — ';

// Kept a short "where I travel to" list rather than free-form text.
const MAX_HOME_VISIT_AREAS = 30;

function countryKeyFromIso(iso) {
  if (!iso || typeof iso !== 'string') return null;
  return ISO_TO_COUNTRY_KEY[iso.trim().toLowerCase()] || null;
}

const isHomeVisitCountrySupported = (iso) => Boolean(countryKeyFromIso(iso));

function subLevelList(regionEntry) {
  return regionEntry.provinces || regionEntry.landsdele || regionEntry.counties || [];
}

function isValidArea(countryKey, value) {
  const c = countryKey && data.countries[countryKey];
  if (!c || typeof value !== 'string') return false;
  const idx = value.indexOf(AREA_SEPARATOR);
  if (idx === -1) return false;
  const region = value.slice(0, idx);
  const sub = value.slice(idx + AREA_SEPARATOR.length);
  const entry = c.regions.find((r) => r.region === region);
  return Boolean(entry) && subLevelList(entry).includes(sub);
}

// Keep only well-formed "Region — Sub" pairs that exist in the dataset for
// this country, deduped in submitted order and capped. Anything else
// (free text, unknown names, wrong country) is dropped — the caller treats an
// empty result for a HOME_VISIT service as a validation error.
function sanitizeHomeVisitAreas(areas, countryKey) {
  if (!Array.isArray(areas) || !countryKey) return [];
  const seen = new Set();
  const result = [];
  for (const raw of areas) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!isValidArea(countryKey, trimmed) || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_HOME_VISIT_AREAS) break;
  }
  return result;
}

module.exports = {
  AREA_SEPARATOR,
  MAX_HOME_VISIT_AREAS,
  countryKeyFromIso,
  isHomeVisitCountrySupported,
  isValidArea,
  sanitizeHomeVisitAreas,
};
