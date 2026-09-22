import { logger } from '@librechat/data-schemas';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { TClassificationConfig } from 'librechat-data-provider';
import type { BooleanQuestion } from '~/classification/types';
import type { Classifier } from '~/classification/types';
import { boolean, isTrue } from '~/classification/questions';
import { isBooleanAnswer } from '~/classification/types';

export type MemoryGate = (messages: BaseMessage[]) => Promise<boolean>;

export type MemoryGateSettings = TClassificationConfig['memoryGate'];

export interface CreateMemoryGateParams {
  classifier: Classifier;
  settings: MemoryGateSettings;
  signal?: AbortSignal;
  windowSize?: number;
  maxChars?: number;
}

const DEFAULT_WINDOW = 6;
const DEFAULT_MAX_CHARS = 8_000;

export const DURABLE_QUESTION: BooleanQuestion = boolean(
  'Does `conversation` hold something about this user that would still matter in an unrelated ' +
    'conversation weeks from now?',
  {
    true:
      'A lasting preference, a fact about who they are or what they work on, or a decision ' +
      'they want remembered.',
    false: 'Small talk, or a detail that only matters inside this task.',
  },
);

function messageText(message: BaseMessage): string {
  const content = message.content;
  if (typeof content === 'string') {
    return content;
  }
  if (!Array.isArray(content)) {
    return '';
  }
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === 'string') {
      parts.push(part);
      continue;
    }
    if (part != null && typeof part === 'object' && 'text' in part) {
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') {
        parts.push(text);
      }
    }
  }
  return parts.join(' ');
}

export function transcribeTail(
  messages: BaseMessage[],
  windowSize: number,
  maxChars: number,
): string {
  const lines: string[] = [];
  let used = 0;
  for (let i = messages.length - 1; i >= 0 && lines.length < windowSize; i--) {
    const message = messages[i];
    const text = messageText(message).replace(/\s+/g, ' ').trim();
    if (text.length === 0) {
      continue;
    }
    const role = message._getType?.() ?? 'message';
    const line = `${role}: ${text}`;
    const clipped =
      line.length > maxChars - used ? line.slice(0, Math.max(0, maxChars - used)) : line;
    if (clipped.length === 0) {
      break;
    }
    lines.push(clipped);
    used += clipped.length;
    if (used >= maxChars) {
      break;
    }
  }
  return lines.reverse().join('\n');
}

export function createMemoryGate(params: CreateMemoryGateParams): MemoryGate | null {
  const { classifier, settings, signal } = params;
  if (settings?.enabled !== true) {
    return null;
  }
  const windowSize = params.windowSize ?? DEFAULT_WINDOW;
  const maxChars = params.maxChars ?? DEFAULT_MAX_CHARS;
  const threshold = settings.threshold;
  const question = boolean(settings.instructions ?? DURABLE_QUESTION.instructions, {
    true: settings.whenTrue ?? DURABLE_QUESTION.criteria?.true,
    false: settings.whenFalse ?? DURABLE_QUESTION.criteria?.false,
  });

  return async function memoryGate(messages: BaseMessage[]): Promise<boolean> {
    const transcript = transcribeTail(messages ?? [], windowSize, maxChars);
    if (transcript.length === 0) {
      return false;
    }
    try {
      const response = await classifier.classify({
        label: 'memory-gate',
        signal,
        state: { conversation: transcript },
        questions: { durable: question },
      });
      const answer = response.answers.durable;
      if (!isBooleanAnswer(answer)) {
        return true;
      }
      const keep = isTrue(answer, threshold);
      logger.debug(
        `[memoryGate] durable ${answer.probability.toFixed(2)} vs threshold ${threshold}: ` +
          `${keep ? 'processing' : 'skipping'} memory`,
      );
      return keep;
    } catch (error) {
      logger.warn(
        '[memoryGate] judgment failed, processing memory as usual: ' +
          (error instanceof Error ? error.message : String(error)),
      );
      return true;
    }
  };
}
