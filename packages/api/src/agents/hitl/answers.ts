import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import type { TAskUserQuestionConfig } from 'librechat-data-provider';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';
import { getSafeErrorMetadata } from '~/utils';

/** The projection a stored-row loader needs; nothing else is read. */
export const RETAINED_ANSWER_ROW_FIELDS = 'messageId parentMessageId content';

/** The fields the scan reads from a stored row or an in-memory message. */
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

/** Owner-scoped read of the branch rows, for a caller whose in-memory rows do not hold them. */
export type RetainedAnswerRowLoader = () => Promise<
  readonly RetainedAnswerSource[] | null | undefined
>;

const SEPARATOR = '\n\n';

const RETAINED_ANSWERS_HEADER = [
  '# Answers the user gave to questions asked earlier in this conversation',
  'Quoted exactly as given, oldest first. They stay in force even after the messages that carried',
  'them were summarized or dropped; do not ask these questions again unless the user changes an answer.',
].join('\n');

interface AskToolCallPart {
  type?: string;
  tool_call?: { id?: unknown; name?: unknown; args?: unknown; output?: unknown };
}

interface AskedQuestion {
  id?: string;
  question: string;
}

interface AskedRequest {
  batched: boolean;
  questions: AskedQuestion[];
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

/** The questions an ask call put to the user, from its stored `args`: the batched
 *  `{ questions: [...] }` shape or the legacy single `{ question }`. */
function readRequest(args: unknown): AskedRequest | undefined {
  const request = parseJsonObject(args);
  if (request == null) {
    return undefined;
  }
  if (Array.isArray(request.questions)) {
    const questions = request.questions.flatMap((item: unknown) => {
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
    return questions.length > 0 ? { batched: true, questions } : undefined;
  }
  return typeof request.question === 'string' && request.question.length > 0
    ? { batched: false, questions: [{ question: request.question }] }
    : undefined;
}

/**
 * The answers stamped on an ask call's `output`. A legacy single question is
 * stamped with the bare text the user typed, so it is quoted as is: decoding it
 * would turn a literal `{"answer": …}` reply into something the user did not
 * say. A batch is stamped as `{ answers: { id } }`, read by question id.
 */
function readAnswers(output: unknown, request: AskedRequest): RetainedAnswer[] {
  if (typeof output !== 'string' || output.length === 0) {
    return [];
  }
  if (!request.batched) {
    return [{ question: request.questions[0].question, answer: output }];
  }
  const batched = parseJsonObject(output)?.answers;
  if (batched == null || typeof batched !== 'object' || Array.isArray(batched)) {
    return [];
  }
  return request.questions.flatMap(({ id, question }) => {
    const answer = id == null ? undefined : Object.getOwnPropertyDescriptor(batched, id)?.value;
    return typeof answer === 'string' && answer.length > 0 ? [{ question, answer }] : [];
  });
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
  const request = readRequest(toolCall.args);
  const answers = request == null ? [] : readAnswers(toolCall.output, request);
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
 * place, so a row seen twice does not repeat itself.
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
 * a compaction are exactly the ones the model no longer sees. The first row
 * seen for an id wins, so in-memory rows take precedence over loaded ones.
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
  return set.answers.map(({ question, answer }) => `Q: ${question}\nA: ${answer}`).join(SEPARATOR);
}

function omittedNote(count: number): string {
  return `(${count} earlier answer${count === 1 ? '' : 's'} omitted to stay within the retained-answer budget.)`;
}

/**
 * The block quoted into the current user turn. Sets are kept newest first while
 * the whole block, separators and omission note included, fits `maxTokens`; the
 * newest set is always kept, the way the summarizer's recency window always
 * keeps the latest turn. What was dropped is counted in a note so the model
 * knows earlier answers exist in the history.
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
  let totalAnswers = 0;
  for (const set of sets) {
    totalAnswers += set.answers.length;
  }
  const budget =
    maxTokens -
    (await countTokens(RETAINED_ANSWERS_HEADER)) -
    (await countTokens(SEPARATOR + omittedNote(totalAnswers)));
  let used = 0;
  let start = sets.length;
  for (let index = sets.length - 1; index >= 0; index--) {
    const cost = await countTokens(SEPARATOR + rendered[index]);
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
  ].join(SEPARATOR);
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

async function loadBranchRows(
  loadMessages: RetainedAnswerRowLoader,
): Promise<readonly RetainedAnswerSource[]> {
  try {
    return (await loadMessages()) ?? [];
  } catch (error) {
    logger.warn(
      '[retainedAnswers] Stored rows unavailable; carrying only the answers already in memory',
      getSafeErrorMetadata(error),
    );
    return [];
  }
}

/**
 * The retained-answers block for one turn, or `undefined` when there is nothing
 * to carry. `messages` are the rows in memory and `parentMessageId` the branch to
 * read; `loadMessages` fetches the rest of the branch for a caller that did not
 * load history, and is only called when retention is on.
 */
export async function buildRetainedAnswersContext({
  messages,
  parentMessageId,
  loadMessages,
  config,
  countTokens,
}: {
  messages: readonly RetainedAnswerSource[];
  parentMessageId: string | null | undefined;
  loadMessages?: RetainedAnswerRowLoader;
  config: TAskUserQuestionConfig | null | undefined;
  countTokens: RetainedAnswerTokenCounter;
}): Promise<string | undefined> {
  const resolved = resolveRetainedAnswersConfig(config);
  if (!resolved.enabled) {
    return undefined;
  }
  const rows =
    loadMessages == null ? messages : [...messages, ...(await loadBranchRows(loadMessages))];
  const sets = collectRetainedAnswers(orderConversationBranch(rows, parentMessageId));
  return renderRetainedAnswers(sets, resolved.maxTokens, countTokens);
}
