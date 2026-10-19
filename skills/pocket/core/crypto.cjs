/**
 * @file crypto.cjs
 * AES-256-GCM encryption & decryption with scrypt key derivation.
 * Obscures all ZIP signatures and headers into opaque binary payloads.
 */

'use strict';

const crypto = require('node:crypto');

const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = SALT_LEN + IV_LEN + TAG_LEN; // 44 bytes
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

/**
 * Derives a 32-byte AES key from password and salt via scrypt.
 * @param {string} password
 * @param {Buffer} salt
 * @returns {Buffer}
 */
function deriveKey(password, salt) {
  if (!password || typeof password !== 'string') {
    throw new Error('Password must be a non-empty string');
  }
  return crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
}

/**
 * Encrypts a plaintext buffer using AES-256-GCM.
 * Layout: [salt:16][iv:12][authTag:16][ciphertext]
 * @param {Buffer} plaintextBuffer
 * @param {string} password
 * @returns {Buffer}
 */
function encryptBuffer(plaintextBuffer, password) {
  if (!Buffer.isBuffer(plaintextBuffer)) {
    throw new TypeError('Plaintext must be a Buffer');
  }
  const salt = crypto.randomBytes(SALT_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const key = deriveKey(password, salt);

  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, ciphertext]);
}

/**
 * Decrypts a buffer encrypted with encryptBuffer.
 * @param {Buffer} encryptedBuffer
 * @param {string} password
 * @returns {Buffer}
 */
function decryptBuffer(encryptedBuffer, password) {
  if (!Buffer.isBuffer(encryptedBuffer)) {
    throw new TypeError('Encrypted payload must be a Buffer');
  }
  if (encryptedBuffer.length < HEADER_LEN) {
    throw new Error(`Corrupted payload: size (${encryptedBuffer.length}B) is less than header (${HEADER_LEN}B)`);
  }

  const salt = encryptedBuffer.subarray(0, SALT_LEN);
  const iv = encryptedBuffer.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const authTag = encryptedBuffer.subarray(SALT_LEN + IV_LEN, HEADER_LEN);
  const ciphertext = encryptedBuffer.subarray(HEADER_LEN);

  const key = deriveKey(password, salt);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

module.exports = {
  encryptBuffer,
  decryptBuffer,
  deriveKey,
  HEADER_LEN
};
