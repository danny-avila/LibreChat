import { createHash, createHmac, randomUUID, timingSafeEqual } from 'crypto';

export const PII_ACTIONS = ['anonymize', 'send_as_is'] as const;
export type PiiAction = (typeof PII_ACTIONS)[number];

type ConfirmationReceipt = {
  version: 1;
  subject: string;
  textHash: string;
  requestId: string;
  actions: PiiAction[];
  expiresAt: number;
  nonce: string;
};

type ReceiptInput = {
  userId: string;
  text: string;
  requestId?: string;
};

type ConsumeReceiptInput = ReceiptInput & {
  action: PiiAction;
  token: string;
};

const RECEIPT_TTL_MS = 2 * 60 * 1000;
const consumedNonces = new Map<string, number>();

const encode = (value: string): string => Buffer.from(value).toString('base64url');
const hashText = (text: string): string => createHash('sha256').update(text).digest('base64url');

const getSecret = (): string => {
  const secret = process.env.PII_CONFIRMATION_SECRET;
  if (secret == null || secret.length < 32) {
    throw new Error('PII confirmation signing is unavailable');
  }
  return secret;
};

const sign = (payload: string): string =>
  createHmac('sha256', getSecret()).update(payload).digest('base64url');

const pruneConsumed = (now: number): void => {
  for (const [nonce, expiresAt] of consumedNonces) {
    if (expiresAt <= now) {
      consumedNonces.delete(nonce);
    }
  }
};

const isReceipt = (value: object): value is ConfirmationReceipt => {
  const receipt = value as Partial<ConfirmationReceipt>;
  return (
    receipt.version === 1 &&
    typeof receipt.subject === 'string' &&
    typeof receipt.textHash === 'string' &&
    typeof receipt.requestId === 'string' &&
    Array.isArray(receipt.actions) &&
    receipt.actions.every((action) => PII_ACTIONS.some((allowed) => allowed === action)) &&
    typeof receipt.expiresAt === 'number' &&
    typeof receipt.nonce === 'string'
  );
};

export const createConfirmationToken = ({ userId, text, requestId }: ReceiptInput): string => {
  const receipt: ConfirmationReceipt = {
    version: 1,
    subject: hashText(userId),
    textHash: hashText(text),
    requestId: requestId ?? '',
    actions: [...PII_ACTIONS],
    expiresAt: Date.now() + RECEIPT_TTL_MS,
    nonce: randomUUID(),
  };
  const payload = encode(JSON.stringify(receipt));
  return `${payload}.${sign(payload)}`;
};

export const consumeConfirmationToken = ({
  token,
  action,
  userId,
  text,
  requestId,
}: ConsumeReceiptInput): boolean => {
  const [payload, suppliedSignature, extra] = token.split('.');
  if (!payload || !suppliedSignature || extra != null) {
    return false;
  }

  const expectedSignature = sign(payload);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return false;
  }

  let parsed: object;
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as object;
  } catch {
    return false;
  }
  if (!isReceipt(parsed)) {
    return false;
  }

  const now = Date.now();
  pruneConsumed(now);
  if (
    parsed.expiresAt <= now ||
    parsed.subject !== hashText(userId) ||
    parsed.textHash !== hashText(text) ||
    parsed.requestId !== (requestId ?? '') ||
    !parsed.actions.includes(action) ||
    consumedNonces.has(parsed.nonce)
  ) {
    return false;
  }

  consumedNonces.set(parsed.nonce, parsed.expiresAt);
  return true;
};

export const isPiiAction = (value: unknown): value is PiiAction =>
  typeof value === 'string' && PII_ACTIONS.some((action) => action === value);
