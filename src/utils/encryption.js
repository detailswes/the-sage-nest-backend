const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH  = 12; // 96-bit IV recommended for GCM
const ENC_PREFIX = 'enc:';

function getKey() {
  const hex = process.env.IBAN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('IBAN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes).');
  }
  return Buffer.from(hex, 'hex');
}

/**
 * Encrypts a plain-text IBAN.
 * Output format:  enc:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 */
function encryptIban(plain) {
  if (!plain) return plain;
  const key    = getKey();
  const iv     = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${ENC_PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a stored IBAN.
 * Gracefully returns the value as-is if it is not encrypted (legacy plain text).
 */
function decryptIban(stored) {
  if (!stored) return stored;
  if (!stored.startsWith(ENC_PREFIX)) return stored; // legacy plain-text — safe fallback
  const parts = stored.slice(ENC_PREFIX.length).split(':');
  if (parts.length !== 3) return stored; // malformed — return raw rather than crash
  const [ivHex, tagHex, dataHex] = parts;
  const key      = getKey();
  const iv       = Buffer.from(ivHex,   'hex');
  const tag      = Buffer.from(tagHex,  'hex');
  const data     = Buffer.from(dataHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(data, undefined, 'utf8') + decipher.final('utf8');
}

module.exports = { encryptIban, decryptIban };
