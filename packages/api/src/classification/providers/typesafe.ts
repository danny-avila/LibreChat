import type {
  Classifier,
  ClassificationAnswer,
  ClassificationResult,
  ClassificationRequest,
  ClassificationQuestion,
} from '../types';
import type { ProviderFetch } from './transport';
import { createTransport } from './transport';
import { parseEnvelope } from './http';

export const PROVIDER_ID = 'typesafe';

export const DEFAULT_BASE_URL = 'https://api.typesafe.ai/v1';
export const DEFAULT_MODEL = 'jev-latest';

export interface TypeSafeProviderOptions {
  apiKey: string;
  /** Base URL; `/systemone` is appended when the path is not already given. */
  baseURL?: string;
  model?: string;
  timeoutMs?: number;
  maxRetries?: number;
  fetch?: ProviderFetch;
  sleep?: (ms: number) => Promise<void>;
}

export function resolveEndpoint(baseURL?: string): string {
  const base = (baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  return base.endsWith('/systemone') ? base : `${base}/systemone`;
}

type WireQuestion =
  | { type: 'noul'; instructions: unknown; criteria?: unknown }
  | { type: 'choice'; instructions: unknown; criteria: unknown }
  | { type: 'score'; instructions: unknown; criteria: unknown };

/** This API calls a yes/no question a noul; the port calls it a boolean. */
export function toWireQuestion(question: ClassificationQuestion): WireQuestion {
  if (question.type === 'boolean') {
    return {
      type: 'noul',
      instructions: question.instructions,
      ...(question.criteria != null ? { criteria: question.criteria } : {}),
    };
  }
  return {
    type: question.type,
    instructions: question.instructions,
    criteria: question.criteria,
  } as WireQuestion;
}

export function readAnswer(answer: unknown): ClassificationAnswer | null {
  if (answer == null || typeof answer !== 'object') {
    return null;
  }
  const record = answer as {
    type?: unknown;
    noul?: unknown;
    choice?: unknown;
    score?: unknown;
    confidence?: unknown;
    probabilities?: unknown;
  };
  const probabilities = (record.probabilities ?? {}) as Record<string, number>;
  const confidence = typeof record.confidence === 'number' ? record.confidence : null;

  if (record.type === 'noul' && typeof record.noul === 'number') {
    return { type: 'boolean', probability: record.noul };
  }
  if (record.type === 'choice' && typeof record.choice === 'string') {
    return { type: 'choice', choice: record.choice, confidence, probabilities };
  }
  if (record.type === 'score' && typeof record.score === 'number') {
    return { type: 'score', score: record.score, confidence, probabilities };
  }
  return null;
}

export function createTypeSafeClassifier(options: TypeSafeProviderOptions): Classifier {
  const endpoint = resolveEndpoint(options.baseURL);
  const send = createTransport({ providerId: PROVIDER_ID, ...options, endpoint });
  const model = options.model ?? DEFAULT_MODEL;

  return {
    id: PROVIDER_ID,
    model,
    async classify(request: ClassificationRequest): Promise<ClassificationResult> {
      const questions: Record<string, WireQuestion> = {};
      for (const [id, question] of Object.entries(request.questions)) {
        questions[id] = toWireQuestion(question);
      }
      const payload = JSON.stringify({ model, state: request.state, questions });
      const body = await send(payload, request.signal, request.label ?? 'classify');
      return parseEnvelope(body, PROVIDER_ID, readAnswer);
    },
  };
}
