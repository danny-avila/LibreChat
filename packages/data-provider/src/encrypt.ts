import crypto from 'crypto';

const key = Buffer.from(process.env.CREDS_KEY ?? '', 'hex');
// const iv = Buffer.from(process.env.CREDS_IV ?? '', 'hex');
const algorithm = 'aes-256-cbc';

// Programatically generate iv
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const encryptDataV2 = (value: any) => {
  const gen_iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(algorithm, key, gen_iv);
  let encrypted = cipher.update(value, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return gen_iv.toString('hex') + ':' + encrypted;
};

export const decryptDataV2 = (encryptedValue: string) => {
  const parts = encryptedValue.split(':');
  // Already decrypted from an earlier invocation
  if (parts.length === 1) {
    return parts[0];
  }
  const gen_iv = Buffer.from(parts.shift() || '', 'hex');
  const encrypted = parts.join(':');
  const decipher = crypto.createDecipheriv(algorithm, key, gen_iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};
