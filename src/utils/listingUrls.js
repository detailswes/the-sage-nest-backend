// Public Webflow directory pages the "Find another expert" CTAs link to.
// English is the default locale; Italian lives under /it/.
const EXPERTS_BASE_URL = process.env.EXPERTS_LISTING_URL || "https://www.sagenest.org/experts";

const EVENTS_BASE_URL = process.env.EVENTS_LISTING_URL || "https://www.sagenest.org/events";

// Italian pages live under /it/ on the same host.
const localise = (base, language) =>
  language === "it" ? base.replace(/^(https?:\/\/[^/]+)/, "$1/it") : base;

const expertsListingUrl = (language) => localise(EXPERTS_BASE_URL, language);
const eventsListingUrl = (language) => localise(EVENTS_BASE_URL, language);

module.exports = { expertsListingUrl, eventsListingUrl };
