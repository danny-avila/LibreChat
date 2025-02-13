const crypto = require('crypto');
const IV_LENGTH = 16;
function normalizeKey(key) {
  // Remove quotes and clean the key
  const cleanKey = key.replace(/"/g, '');
  // If key is hex string, convert to Buffer
  if (/^[0-9a-f]+$/i.test(cleanKey)) {
    return Buffer.from(cleanKey, 'hex');
  }
  // If not hex, hash the key to ensure proper length
  const hash = crypto.createHash('sha256');
  hash.update(cleanKey);
  return hash.digest();
}
function encrypt(text, userKey) {
  if (!text || !userKey) {
    throw new Error('Both text and encryption key are required');
  }
  try {
    const key = normalizeKey(userKey);
    const textToEncrypt = typeof text === 'string' ? text : JSON.stringify(text);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(textToEncrypt, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}
function decrypt(text, userKey) {
  if (!text || !userKey) {
    throw new Error('Both text and encryption key are required');
  }
  try {
    if (!text.includes(':')) {
      return text;
    }
    const key = normalizeKey(userKey);
    const [ivHex, encryptedHex] = text.split(':');
    if (!ivHex || !encryptedHex) {
      return text;
    }
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw error;
  }
}
module.exports = { encrypt, decrypt };