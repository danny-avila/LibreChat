const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32); // Generate a random encryption key
const iv = crypto.randomBytes(16); // Generate a random initialization vector

function encrypt(value) {
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  console.log('value', value);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  console.log('encrypted', encrypted);
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedValue) {
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  let decrypted = decipher.update(encryptedValue, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

module.exports = { encrypt, decrypt };
