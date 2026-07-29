// Italian Codice Fiscale — pattern + check-character validation.
//
// The numeric-looking groups (year, day+sex, cadastral number) accept the
// omocodia substitution letters (L M N P Q R S T U V) alongside digits — the
// tax authority swaps digits for these when two people would otherwise share
// an identical code. Day values 41–71 are valid (female codes add 40).
const CODICE_FISCALE_PATTERN =
  /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[ABCDEHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/;

// Official checksum tables (mod 26 over the first 15 characters). Each table
// assigns a value to every digit/letter that can legally appear at an odd or
// even position — this is what makes the checksum omocodia-aware: a
// substituted letter is scored the same way a digit at that position would be.
const ODD_VALUES = {
  0: 1, 1: 0, 2: 5, 3: 7, 4: 9, 5: 13, 6: 15, 7: 17, 8: 19, 9: 21,
  A: 1, B: 0, C: 5, D: 7, E: 9, F: 13, G: 15, H: 17, I: 19, J: 21, K: 2, L: 4, M: 18,
  N: 20, O: 11, P: 3, Q: 6, R: 8, S: 12, T: 14, U: 16, V: 10, W: 22, X: 25, Y: 24, Z: 23,
};
const EVEN_VALUES = {
  0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9,
  A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, I: 8, J: 9, K: 10, L: 11, M: 12,
  N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, T: 19, U: 20, V: 21, W: 22, X: 23, Y: 24, Z: 25,
};
const REMAINDER_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function normalizeCodiceFiscale(raw) {
  return (raw || "").trim().replace(/\s+/g, "").toUpperCase();
}

function computeCheckCharacter(firstFifteen) {
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    const table = i % 2 === 0 ? ODD_VALUES : EVEN_VALUES; // position 1,3,5… (1-indexed) is odd
    sum += table[firstFifteen[i]] ?? 0;
  }
  return REMAINDER_LETTERS[sum % 26];
}

// One error covers both a pattern mismatch and a wrong check character —
// callers don't need to distinguish the two cases in copy.
function isValidCodiceFiscale(raw) {
  const normalized = normalizeCodiceFiscale(raw);
  if (!CODICE_FISCALE_PATTERN.test(normalized)) return false;
  return computeCheckCharacter(normalized.slice(0, 15)) === normalized[15];
}

module.exports = { normalizeCodiceFiscale, isValidCodiceFiscale, CODICE_FISCALE_PATTERN };
