// Common European city names, translated for the IT templates so the "—
// [City] time" phrase reads naturally regardless of which timezone the
// recipient's account is set to (not just Italian ones). Unmapped cities
// fall back to their English/IANA form, which is still understandable in
// Italian.
const CITY_IT = {
  Copenhagen: "Copenaghen",
  Rome: "Roma",
  Milan: "Milano",
  Naples: "Napoli",
  Turin: "Torino",
  Florence: "Firenze",
  Venice: "Venezia",
  London: "Londra",
  Paris: "Parigi",
  Madrid: "Madrid",
  Berlin: "Berlino",
  Vienna: "Vienna",
  Athens: "Atene",
  Lisbon: "Lisbona",
  Dublin: "Dublino",
  Amsterdam: "Amsterdam",
  Brussels: "Bruxelles",
  Stockholm: "Stoccolma",
  Warsaw: "Varsavia",
  Prague: "Praga",
  Zurich: "Zurigo",
};

function cityLabel(timezone, language) {
  const raw = timezone && timezone.includes("/") ? timezone.split("/").pop().replace(/_/g, " ") : timezone || "UTC";
  if (language === "it" && CITY_IT[raw]) return CITY_IT[raw];
  return raw;
}

const TZ_TIME_PHRASE = {
  en: (abbrev, city) => `(${abbrev} — ${city} time)`,
  it: (abbrev, city) => `(${abbrev} — ora di ${city})`,
};

/**
 * Formats a session date/time in the given IANA timezone (falling back to
 * UTC), with the timezone abbreviation and city named — e.g.
 * "14:00 (CEST — Copenhagen time)" / "14:00 (CEST — ora di Copenaghen)".
 */
function formatDateTime(scheduledAt, timezone, language) {
  const lang = language === "it" ? "it" : "en";
  const tz = timezone || "UTC";
  const locale = lang === "it" ? "it-IT" : "en-GB";
  const date = new Date(scheduledAt);

  const dateStr = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: tz }).format(date);
  const timeStr = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz }).format(date);
  const abbrevParts = new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone: tz }).formatToParts(date);
  const abbrev = abbrevParts.find((p) => p.type === "timeZoneName")?.value || tz;
  const city = cityLabel(tz, lang);

  return { dateStr, timeStr, tzLabel: TZ_TIME_PHRASE[lang](abbrev, city) };
}

module.exports = { formatDateTime, cityLabel };
