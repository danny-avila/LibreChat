import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import type { TAskUserQuestionConfig } from 'librechat-data-provider';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';

/** The fields the scan reads from a persisted row or a seeded content array. */
export interface RetainedAnswerSource {
  messageId?: string | null;
  parentMessageId?: string | null;
  content?: unknown;
}

export interface RetainedAnswer {
  question: string;
  answer: string;
}

/** The answers one `ask_user_question` call received, in question order. */
export interface RetainedAnswerSet {
  toolCallId?: string;
  answers: RetainedAnswer[];
}

export interface RetainedAnswersConfig {
  enabled: boolean;
  maxTokens: number;
}

export type RetainedAnswerTokenCounter = (text: string) => number | Promise<number>;

const RETAINED_ANSWERS_HEADER = [
  '# Answers the user gave to your questions',
  'Quoted exactly as given, oldest first. They stay in force even after the messages that carried',
  'them are summarized or dropped; do not ask again unless the user changes an answer.',
].join('\n');

interface AskToolCallPart {
  type?: string;
  tool_call?: { id?: unknown; name?: unknown; args?: unknown; output?: unknown };
}

interface AskedQuestion {
  id?: string;
  question: string;
}

function parseJsonObject(value: unknown): Record<string, unknown> | undefined {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== 'string' || value.length === 0) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed != null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** The questions an ask call put to the user, from its persisted `args`: the batched
 *  `{ questions: [...] }` shape or the legacy single `{ question }`. */
function readQuestions(args: unknown): AskedQuestion[] {
  const request = parseJsonObject(args);
  if (request == null) {
    return [];
  }
  if (Array.isArray(request.questions)) {
    return request.questions.flatMap((item: unknown) => {
      const candidate = item as { id?: unknown; question?: unknown } | null;
      if (typeof candidate?.question !== 'string' || candidate.question.length === 0) {
        return [];
      }
      return [
        {
          ...(typeof candidate.id === 'string' && candidate.id.length > 0 && { id: candidate.id }),
          question: candidate.question,
        },
      ];
    });
  }
  return typeof request.question === 'string' && request.question.length > 0
    ? [{ question: request.question }]
    : [];
}

/**
 * The answers stamped on an ask call's `output`: `{ answers: { id: value } }` for a
 * batch, `{ answer }` or the bare answer text for the legacy single question. A
 * bare answer that happens to parse as JSON is still the answer, verbatim.
 */
function readAnswers(output: unknown, questions: AskedQuestion[]): RetainedAnswer[] {
  if (typeof output !== 'string' || output.length === 0 || questions.length === 0) {
    return [];
  }
  const resolution = parseJsonObject(output);
  const batched = resolution?.answers;
  if (batched != null && typeof batched === 'object' && !Array.isArray(batched)) {
    return questions.flatMap(({ id, question }) => {
      const answer = id == null ? undefined : Object.getOwnPropertyDescriptor(batched, id)?.value;
      return typeof answer === 'string' && answer.length > 0 ? [{ question, answer }] : [];
    });
  }
  if (questions.length !== 1) {
    return [];
  }
  const answer = typeof resolution?.answer === 'string' ? resolution.answer : output;
  return answer.length > 0 ? [{ question: questions[0].question, answer }] : [];
}

function readAskToolCall(part: unknown): RetainedAnswerSet | undefined {
  const candidate = part as AskToolCallPart | null | undefined;
  const toolCall = candidate?.tool_call;
  if (
    candidate?.type !== ContentTypes.TOOL_CALL ||
    toolCall?.name !== ASK_USER_QUESTION_TOOL_NAME
  ) {
    return undefined;
  }
  const answers = readAnswers(toolCall.output, readQuestions(toolCall.args));
  if (answers.length === 0) {
    return undefined;
  }
  return {
    ...(typeof toolCall.id === 'string' && toolCall.id.length > 0 && { toolCallId: toolCall.id }),
    answers,
  };
}

/**
 * Every answered `ask_user_question` call in `sources`, in the order the sources
 * are given. A later stamp for the same tool call replaces the earlier one in
 * place, so a turn seeded on top of its persisted row does not repeat itself.
 */
export function collectRetainedAnswers(
  sources: readonly RetainedAnswerSource[],
): RetainedAnswerSet[] {
  const sets: RetainedAnswerSet[] = [];
  const indexByToolCallId = new Map<string, number>();
  for (const source of sources) {
    if (!Array.isArray(source?.content)) {
      continue;
    }
    for (const part of source.content) {
      const set = readAskToolCall(part);
      if (set == null) {
        continue;
      }
      const existing = set.toolCallId == null ? undefined : indexByToolCallId.get(set.toolCallId);
      if (existing != null) {
        sets[existing] = set;
        continue;
      }
      if (set.toolCallId != null) {
        indexByToolCallId.set(set.toolCallId, sets.length);
      }
      sets.push(set);
    }
  }
  return sets;
}

/**
 * The branch that ends at `parentMessageId`, oldest first: the walk the prompt
 * builder makes, without its stop at a checkpoint summary. Answers given before
 * a compaction are exactly the ones the model no longer sees.
 */
export function orderConversationBranch<T extends RetainedAnswerSource>(
  messages: readonly T[],
  parentMessageId: string | null | undefined,
): T[] {
  if (parentMessageId == null || parentMessageId === Constants.NO_PARENT) {
    return [];
  }
  const byId = new Map<string, T>();
  for (const message of messages) {
    const messageId = message?.messageId;
    if (typeof messageId === 'string' && !byId.has(messageId)) {
      byId.set(messageId, message);
    }
  }
  const branch: T[] = [];
  const visited = new Set<string>();
  let current: string | null | undefined = parentMessageId;
  while (typeof current === 'string' && current !== Constants.NO_PARENT && !visited.has(current)) {
    visited.add(current);
    const message = byId.get(current);
    if (message == null) {
      break;
    }
    branch.push(message);
    current = message.parentMessageId;
  }
  return branch.reverse();
}

function renderSet(set: RetainedAnswerSet): string {
  return set.answers.map(({ question, answer }) => `Q: ${question}\nA: ${answer}`).join('\n\n');
}

function omittedNote(count: number): string {
  return `(${count} earlier answer${count === 1 ? '' : 's'} omitted to stay within the retained-answer budget.)`;
}

/**
 * The block carried in the dynamic instructions. Sets are kept newest first
 * while they fit `maxTokens`; the newest set is always kept, the way the
 * summarizer's recency window always keeps the latest turn. What was dropped is
 * counted in a note so the model knows earlier answers exist in the history.
 */
export async function renderRetainedAnswers(
  sets: readonly RetainedAnswerSet[],
  maxTokens: number,
  countTokens: RetainedAnswerTokenCounter,
): Promise<string | undefined> {
  if (sets.length === 0) {
    return undefined;
  }
  const rendered = sets.map(renderSet);
  const budget =
    maxTokens -
    (await countTokens(RETAINED_ANSWERS_HEADER)) -
    (await countTokens(omittedNote(sets.length)));
  let used = 0;
  let start = sets.length;
  for (let index = sets.length - 1; index >= 0; index--) {
    const cost = await countTokens(rendered[index]);
    if (index < sets.length - 1 && used + cost > budget) {
      break;
    }
    used += cost;
    start = index;
  }
  let omitted = 0;
  for (let index = 0; index < start; index++) {
    omitted += sets[index].answers.length;
  }
  return [
    RETAINED_ANSWERS_HEADER,
    ...(omitted > 0 ? [omittedNote(omitted)] : []),
    ...rendered.slice(start),
  ].join('\n\n');
}

/** Config as the run reads it: on unless disabled, and a positive integer budget. */
export function resolveRetainedAnswersConfig(
  config: TAskUserQuestionConfig | null | undefined,
): RetainedAnswersConfig {
  const retained = config?.retainedAnswers;
  const maxTokens = retained?.maxTokens;
  return {
    enabled: retained?.enabled !== false,
    maxTokens:
      typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens > 0
        ? Math.floor(maxTokens)
        : DEFAULT_RETAINED_ANSWER_TOKENS,
  };
}

/**
 * The retained-answers block for one run, or `undefined` when there is nothing
 * to carry. `messages` is the conversation's stored rows and `parentMessageId`
 * the branch to read; `seedContent` is the paused turn's own content on a
 * resume, which holds the answer just given before any row records it.
 */
export async function buildRetainedAnswersContext({
  messages,
  parentMessageId,
  seedContent,
  config,
  countTokens,
}: {
  messages: readonly RetainedAnswerSource[];
  parentMessageId: string | null | undefined;
  seedContent?: readonly unknown[];
  config: TAskUserQuestionConfig | null | undefined;
  countTokens: RetainedAnswerTokenCounter;
}): Promise<string | undefined> {
  const resolved = resolveRetainedAnswersConfig(config);
  if (!resolved.enabled) {
    return undefined;
  }
  const sources: RetainedAnswerSource[] = orderConversationBranch(messages, parentMessageId);
  if (seedContent != null) {
    sources.push({ content: seedContent });
  }
  return renderRetainedAnswers(collectRetainedAnswers(sources), resolved.maxTokens, countTokens);
}
