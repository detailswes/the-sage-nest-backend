// Currencies supported across the platform, and per-currency service price bounds.
const VALID_CURRENCIES = ['EUR', 'GBP', 'DKK', 'SEK', 'NOK', 'CHF'];

const PRICE_LIMITS = {
  EUR: { min: 5,   max: 2000  },
  GBP: { min: 5,   max: 2000  },
  DKK: { min: 50,  max: 10000 },
  SEK: { min: 50,  max: 20000 },
  NOK: { min: 50,  max: 20000 },
  CHF: { min: 5,   max: 2000  },
};

module.exports = { VALID_CURRENCIES, PRICE_LIMITS };
