import { logger } from '@librechat/data-schemas';

export type LangfuseFeedback = {
  rating?: 'thumbsUp' | 'thumbsDown';
  tag?: string;
  text?: string;
};

export type SendFeedbackScoreParams = {
  traceId: string;
  feedback?: LangfuseFeedback | null;
};

const DEFAULT_BASE_URL = 'https://cloud.langfuse.com';
const BASE =
  process.env.LANGFUSE_BASE_URL ??
  process.env.LANGFUSE_HOST ??
  process.env.LANGFUSE_BASEURL ??
  DEFAULT_BASE_URL;

function isFalseEnv(value?: string): boolean {
  return value != null && ['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

function isSampleRateEnabled(value?: string): boolean {
  if (value == null || value.trim() === '') {
    return true;
  }
  const parsed = Number(value);
  return !Number.isFinite(parsed) || parsed !== 0;
}

const ENABLED =
  Boolean(process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY) &&
  !isFalseEnv(process.env.LANGFUSE_TRACING_ENABLED) &&
  isSampleRateEnabled(process.env.LANGFUSE_SAMPLE_RATE);
const AUTHORIZATION = ENABLED
  ? 'Basic ' +
    Buffer.from(`${process.env.LANGFUSE_PUBLIC_KEY}:${process.env.LANGFUSE_SECRET_KEY}`).toString(
      'base64',
    )
  : undefined;
const ENVIRONMENT = process.env.LANGFUSE_TRACING_ENVIRONMENT;

export async function sendFeedbackScore({
  traceId,
  feedback,
}: SendFeedbackScoreParams): Promise<void> {
  if (!ENABLED || !AUTHORIZATION || !traceId) {
    return;
  }

  const scoreId = `feedback-${traceId}`;

  if (!feedback?.rating) {
    const res = await fetch(`${BASE}/api/public/scores/${encodeURIComponent(scoreId)}`, {
      method: 'DELETE',
      headers: { Authorization: AUTHORIZATION },
    });
    if (!res.ok && res.status !== 404) {
      throw new Error(`langfuse score delete ${res.status}: ${await res.text()}`);
    }
    return;
  }

  const body = {
    id: scoreId,
    traceId,
    name: 'user-feedback',
    value: feedback.rating === 'thumbsUp' ? 1 : 0,
    dataType: 'BOOLEAN',
    comment: [feedback.tag, feedback.text].filter(Boolean).join(' — ') || undefined,
    metadata: { rating: feedback.rating, tag: feedback.tag },
    ...(ENVIRONMENT ? { environment: ENVIRONMENT } : {}),
  };

  const res = await fetch(`${BASE}/api/public/scores`, {
    method: 'POST',
    headers: { Authorization: AUTHORIZATION, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`langfuse score create ${res.status}: ${await res.text()}`);
  }
  logger.debug(`[langfuse] feedback score sent for trace ${traceId} (${feedback.rating})`);
}
