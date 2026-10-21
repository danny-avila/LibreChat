import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export const channelHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export function channelSecretMatches(value: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(channelHash(value)), Buffer.from(channelHash(expected)));
}

/** Bind encrypted Slack credentials to their installation, using the deployment credential key. */
export function createChannelCipher(keyHex: string) {
  const key = Buffer.from(keyHex, 'hex');
  function checkKey() {
    if (key.length !== 32) throw new Error('Channel credential encryption is not configured');
  }
  return {
    encrypt(value: string, installationId: string): string {
      checkKey();
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(installationId));
      const data = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
    },
    decrypt(value: string, installationId: string): string {
      checkKey();
      const parts = value.split('.');
      if (parts.length !== 3) throw new Error('Invalid channel credential ciphertext');
      const [iv, tag, data] = parts.map((part) => Buffer.from(part, 'base64url'));
      const cipher = createDecipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(Buffer.from(installationId));
      cipher.setAuthTag(tag);
      return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
    },
  };
}
