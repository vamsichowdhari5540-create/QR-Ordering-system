const crypto = require('crypto');

function normalizeMobile(mobile) {
  return String(mobile).trim();
}

// Host dashboards' env var boxes are often multi-line textareas — an
// accidental Enter after pasting leaves a trailing newline that would
// otherwise silently change every HMAC/encryption key derived from it.
function mobileIndexKey() {
  return process.env.MOBILE_INDEX_KEY?.trim();
}

function encryptionKey() {
  return Buffer.from(process.env.ENCRYPTION_KEY?.trim() || '', 'hex');
}

// Deterministic index for lookups — never reversible, never logged raw.
function mobileIndex(mobile) {
  return crypto
    .createHmac('sha256', mobileIndexKey())
    .update(normalizeMobile(mobile))
    .digest('hex');
}

// AES-256-GCM encryption for display values (receipts, admin dashboard).
function encryptMobile(mobile) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(normalizeMobile(mobile), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

function decryptMobile(encrypted) {
  const key = encryptionKey();
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// Masked form for anywhere phone numbers might end up in logs/UI lists.
function maskMobile(mobile) {
  const m = normalizeMobile(mobile);
  if (m.length <= 4) return '****';
  return `${'*'.repeat(m.length - 4)}${m.slice(-4)}`;
}

module.exports = { mobileIndex, encryptMobile, decryptMobile, maskMobile };
