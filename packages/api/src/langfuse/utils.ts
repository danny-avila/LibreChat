export function isFalseEnv(value?: string): boolean {
  return value != null && ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function isTrueEnv(value?: string): boolean {
  return value != null && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

export function toBasicAuthorization(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}
