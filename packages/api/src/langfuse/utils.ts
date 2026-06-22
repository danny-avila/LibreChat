export function toBasicAuthorization(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}

const TRUE_ENV_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_ENV_VALUES = new Set(['0', 'false', 'no', 'off']);

export function isTrueEnv(value?: string | boolean | null): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return typeof value === 'string' && TRUE_ENV_VALUES.has(value.trim().toLowerCase());
}

export function isFalseEnv(value?: string | boolean | null): boolean {
  if (typeof value === 'boolean') {
    return !value;
  }
  return typeof value === 'string' && FALSE_ENV_VALUES.has(value.trim().toLowerCase());
}
