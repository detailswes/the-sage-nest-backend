// Italian fiscal code (Codice Fiscale) normalization + validation.
// Self-implemented rather than an external library — booking flow spec v1.7
// §9 explicitly warns that several maintained libraries compute the check
// character against the *unsubstituted* form, which rejects valid omocodia
// codes. The official odd/even character-value tables below already cover
// all 36 alphanumerics directly, so no un-substitution step is needed —
// applying them straight to the (possibly-omocodia) 15 characters is correct.

const PATTERN = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

const ODD_VALUES = {
  '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};

const EVEN_VALUES = {
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};

const CHECK_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function normalizeFiscalCode(raw) {
  if (typeof raw !== 'string') return '';
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

function computeCheckCharacter(first15) {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const char = first15[i];
    // 1-indexed position: odd positions are index 0,2,4,... (even indices)
    sum += i % 2 === 0 ? ODD_VALUES[char] : EVEN_VALUES[char];
  }
  return CHECK_LETTERS[sum % 26];
}

function isValidItalianFiscalCode(normalized) {
  if (!PATTERN.test(normalized)) return false;
  const first15 = normalized.slice(0, 15);
  const checkChar = normalized[15];
  return computeCheckCharacter(first15) === checkChar;
}

module.exports = { normalizeFiscalCode, isValidItalianFiscalCode };
