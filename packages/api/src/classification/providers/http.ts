import type {
  Classifier,
  ClassificationUsage,
  ClassificationAnswer,
  ClassificationResult,
  ClassificationRequest,
} from '../types';
import type { ProviderFetch } from './transport';
import { ClassificationError } from '../types';
import { createTransport } from './transport';

export const PROVIDER_ID = 'http';

export interface HttpProviderOptions {
  apiKey: string;
  /** Full URL, not a base path. */
  endpoint: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: ProviderFetch;
  sleep?: (ms: number) => Promise<void>;
}

function readAnswer(answer: unknown): ClassificationAnswer | null {
  if (answer == null || typeof answer !== 'object') {
    return null;
  }
  const record = answer as {
    type?: unknown;
    probability?: unknown;
    choice?: unknown;
    score?: unknown;
    confidence?: unknown;
    probabilities?: unknown;
  };
  const probabilities = (record.probabilities ?? {}) as Record<string, number>;
  const confidence = typeof record.confidence === 'number' ? record.confidence : null;

  if (record.type === 'boolean' && typeof record.probability === 'number') {
    return { type: 'boolean', probability: record.probability };
  }
  if (record.type === 'choice' && typeof record.choice === 'string') {
    return { type: 'choice', choice: record.choice, confidence, probabilities };
  }
  if (record.type === 'score' && typeof record.score === 'number') {
    return { type: 'score', score: record.score, confidence, probabilities };
  }
  return null;
}

export function parseEnvelope(
  body: string,
  providerId: string,
  readOne: (answer: unknown) => ClassificationAnswer | null,
): ClassificationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ClassificationError('malformed_response', 'response was not JSON', {
      provider: providerId,
    });
  }
  if (parsed == null || typeof parsed !== 'object') {
    throw new ClassificationError('malformed_response', 'response was not an object', {
      provider: providerId,
    });
  }
  const record = parsed as { model?: unknown; answers?: unknown; usage?: unknown };
  if (record.answers == null || typeof record.answers !== 'object') {
    throw new ClassificationError('malformed_response', 'response carried no answers', {
      provider: providerId,
    });
  }

  const answers: Record<string, ClassificationAnswer> = {};
  for (const [id, answer] of Object.entries(record.answers as Record<string, unknown>)) {
    const mapped = readOne(answer);
    if (mapped != null) {
      answers[id] = mapped;
    }
  }

  const raw = (record.usage ?? {}) as { input_tokens?: number; output_tokens?: number };
  const usage: ClassificationUsage = {
    inputTokens: raw.input_tokens ?? 0,
    outputTokens: raw.output_tokens ?? 0,
  };

  return {
    model: typeof record.model === 'string' ? record.model : 'unknown',
    answers,
    usage,
  };
}

export function createHttpClassifier(options: HttpProviderOptions): Classifier {
  const send = createTransport({ providerId: PROVIDER_ID, ...options });
  const model = options.model ?? '';

  return {
    id: PROVIDER_ID,
    model,
    async classify(request: ClassificationRequest): Promise<ClassificationResult> {
      const payload = JSON.stringify({
        ...(model ? { model } : {}),
        state: request.state,
        questions: request.questions,
      });
      const body = await send(payload, request.signal, request.label ?? 'classify');
      return parseEnvelope(body, PROVIDER_ID, readAnswer);
    },
  };
}
