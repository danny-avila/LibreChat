require('dotenv').config();

const crypto = require('crypto');
const key = Buffer.from(process.env.CREDS_KEY, 'hex');
const iv = Buffer.from(process.env.CREDS_IV, 'hex');
const algorithm = 'aes-256-cbc';

function encrypt(value) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedValue) {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Programatically generate iv
function encryptV2(value) {
  const gen_iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, gen_iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return gen_iv.toString('hex') + ':' + encrypted;
}

function decryptV2(encryptedValue) {
  const parts = encryptedValue.split(':');
  const gen_iv = Buffer.from(parts.shift(), 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv(algorithm, key, gen_iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt, encryptV2, decryptV2 };
