export function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function isFalseEnv(value?: string): boolean {
  return value != null && ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function isEnabledUnlessBlankOrFalse(value?: string): boolean {
  if (value == null) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return normalized !== '' && !['0', 'false', 'no', 'off'].includes(normalized);
}

export function toBasicAuthorization(publicKey: string, secretKey: string): string {
  return `Basic ${Buffer.from(`${publicKey}:${secretKey}`).toString('base64')}`;
}
