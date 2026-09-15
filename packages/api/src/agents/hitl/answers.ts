import { logger } from '@librechat/data-schemas';
import { HumanMessage } from '@librechat/agents/langchain/messages';
import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import {
  withMessageRole,
  getTokenCountForMessage,
  markTokenCounterCacheCompatible,
} from '@librechat/agents';
import type { BaseMessage } from '@librechat/agents/langchain/messages';
import type { TAskUserQuestionConfig } from 'librechat-data-provider';
import type { TokenCounter } from '@librechat/agents';
import type { EncodingName } from '~/utils/tokenizer';
import { prependContextText, CLAUDE_TOKEN_CORRECTION } from '../client';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';
import { getSafeErrorMetadata } from '~/utils';
import Tokenizer from '~/utils/tokenizer';

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

/** The stored-row query, in the shape the data layer's `getMessages` already has. */
export type RetainedAnswerRowQuery = (
  filter: { conversationId: string; user: string },
  select: string,
) => Promise<readonly RetainedAnswerSource[] | null | undefined>;

const SEPARATOR = '\n\n';

const RETAINED_ANSWERS_HEADER = [
  '# Answers the user gave to questions asked earlier in this conversation',
  'Quoted exactly as given, oldest first. They stay in force even after the messages that carried',
  'them were summarized or dropped; do not ask these questions again unless the user changes an answer.',
].join('\n');

interface AskToolCallPart {
  type?: string;
  tool_call?: {
    id?: unknown;
    name?: unknown;
    args?: unknown;
    output?: unknown;
    inputValidationError?: unknown;
  };
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

/** A stored `args` value that is a JSON-encoded string: the question itself, as
 *  pause records written before the structured request shape carried it. */
function parseJsonString(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith('"')) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === 'string' && parsed.length > 0 ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** The questions an ask call put to the user, from its stored `args`: the batched
 *  `{ questions: [...] }` shape, the legacy single `{ question }`, or the bare
 *  question string of a pause record that predates both. */
function readRequest(args: unknown): AskedRequest | undefined {
  const bare = parseJsonString(args);
  if (bare != null) {
    return { batched: false, questions: [{ question: bare }] };
  }
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

/** A call whose input failed schema validation persisted the validation error
 *  as its `output`; that text is not an answer. */
function readAskToolCall(part: unknown): RetainedAnswerSet | undefined {
  const candidate = part as AskToolCallPart | null | undefined;
  const toolCall = candidate?.tool_call;
  if (
    candidate?.type !== ContentTypes.TOOL_CALL ||
    toolCall?.name !== ASK_USER_QUESTION_TOOL_NAME ||
    toolCall.inputValidationError === true
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
 * are given. Rows are already unique by message id after the branch walk, and
 * tool-call ids are not conversation-global (a provider may reuse `call_0` on
 * every turn), so nothing is merged across rows.
 */
export function collectRetainedAnswers(
  sources: readonly RetainedAnswerSource[],
): RetainedAnswerSet[] {
  const sets: RetainedAnswerSet[] = [];
  for (const source of sources) {
    if (!Array.isArray(source?.content)) {
      continue;
    }
    for (const part of source.content) {
      const set = readAskToolCall(part);
      if (set != null) {
        sets.push(set);
      }
    }
  }
  return sets;
}

/**
 * The branch that ends at `parentMessageId`, oldest first: the walk the prompt
 * builder makes, without its stop at a checkpoint summary. Answers given before
 * a compaction are exactly the ones the model no longer sees. The first row
 * seen for an id wins, so a caller puts the rows it trusts most first.
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

/**
 * Whether an ordered branch reaches its root. The rows a turn holds in memory
 * stop early when a checkpoint summary bounded the history read, or when a
 * warm event-actor turn holds only its new event message; both leave the oldest
 * row pointing at a parent that is not in memory.
 */
export function reachesBranchRoot(branch: readonly RetainedAnswerSource[]): boolean {
  const root = branch[0];
  if (root == null) {
    return false;
  }
  const parent = root.parentMessageId;
  return parent == null || parent === '' || parent === Constants.NO_PARENT;
}

function renderSet(set: RetainedAnswerSet): string {
  return set.answers.map(({ question, answer }) => `Q: ${question}\nA: ${answer}`).join(SEPARATOR);
}

function omittedNote(count: number): string {
  return `(${count} earlier answer${count === 1 ? '' : 's'} omitted to stay within the retained-answer budget.)`;
}

async function measureTokens(
  text: string,
  countTokens: RetainedAnswerTokenCounter,
): Promise<number> {
  const count = await countTokens(text);
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Invalid retained-answer token count');
  }
  return count;
}

/**
 * The block quoted into the current user turn. When every set fits `maxTokens`
 * with the header and separators, all of them are rendered oldest first.
 * Otherwise sets are kept newest first while the block, omission note
 * included, still fits; the newest set is always kept, the way the
 * summarizer's recency window always keeps the latest turn.
 */
export async function renderRetainedAnswers(
  sets: readonly RetainedAnswerSet[],
  maxTokens: number,
  countTokens: RetainedAnswerTokenCounter,
): Promise<string | undefined> {
  if (sets.length === 0) {
    return undefined;
  }
  const newestFirst: string[] = [];
  const answerCounts = [0];
  const totalAnswers = sets.reduce((total, set) => total + set.answers.length, 0);
  const candidate = (count: number, note = false): string => {
    while (newestFirst.length < count) {
      const set = sets[sets.length - newestFirst.length - 1];
      newestFirst.push(renderSet(set));
      answerCounts.push(answerCounts[answerCounts.length - 1] + set.answers.length);
    }
    return [
      RETAINED_ANSWERS_HEADER,
      ...(note ? [omittedNote(totalAnswers - answerCounts[count])] : []),
      ...newestFirst.slice(0, count).reverse(),
    ].join(SEPARATOR);
  };
  let low = 0;
  let high = 1;
  while ((await measureTokens(candidate(high), countTokens)) <= maxTokens) {
    low = high;
    if (high === sets.length) {
      return candidate(high);
    }
    high = Math.min(sets.length, high * 2);
  }
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if ((await measureTokens(candidate(middle), countTokens)) <= maxTokens) {
      low = middle;
    } else {
      high = middle;
    }
  }
  let count = Math.max(1, low);
  while (true) {
    const block = candidate(count, count < sets.length);
    if ((await measureTokens(block, countTokens)) <= maxTokens || count === 1) {
      return block;
    }
    count--;
  }
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
      typeof maxTokens === 'number' && Number.isFinite(maxTokens) && maxTokens >= 1
        ? Math.floor(maxTokens)
        : DEFAULT_RETAINED_ANSWER_TOKENS,
  };
}

async function loadBranchRows(
  getMessages: RetainedAnswerRowQuery,
  conversationId: string,
  userId: string,
): Promise<readonly RetainedAnswerSource[]> {
  try {
    return (await getMessages({ conversationId, user: userId }, RETAINED_ANSWER_ROW_FIELDS)) ?? [];
  } catch (error) {
    logger.warn(
      '[retainedAnswers] Stored rows unavailable; carrying only the answers already in memory',
      getSafeErrorMetadata(error),
    );
    return [];
  }
}

/** The owner-scoped read of the branch rows, when the caller supplied what it needs. */
function resolveRowLoad(
  getMessages: RetainedAnswerRowQuery | undefined,
  conversationId: string | null | undefined,
  userId: string | null | undefined,
): (() => Promise<readonly RetainedAnswerSource[]>) | undefined {
  if (
    getMessages == null ||
    typeof conversationId !== 'string' ||
    conversationId.length === 0 ||
    typeof userId !== 'string' ||
    userId.length === 0
  ) {
    return undefined;
  }
  return () => loadBranchRows(getMessages, conversationId, userId);
}

export interface RetainedAnswersContextInput {
  /** The rows in memory, which may stop short of the branch root. */
  messages: readonly RetainedAnswerSource[];
  parentMessageId: string | null | undefined;
  /**
   * Every row the turn's history read already fetched, when it made one; used
   * to complete a branch whose rows in memory do not reach its root (a
   * checkpoint summary bounded the walk) without reading the conversation a
   * second time. Stored rows outrank the copies in memory, which may already be
   * prompt-shaped.
   */
  storedRows?: readonly RetainedAnswerSource[] | null;
  /**
   * The stored-row query, for a turn that made no history read (a warm
   * event-actor turn holds only its new event message). Called only when
   * retention is on, the branch is incomplete and no `storedRows` were given.
   */
  getMessages?: RetainedAnswerRowQuery;
  conversationId?: string | null;
  userId?: string | null;
  config: TAskUserQuestionConfig | null | undefined;
  countTokens: RetainedAnswerTokenCounter;
}

async function buildContext({
  messages,
  parentMessageId,
  storedRows,
  getMessages,
  conversationId,
  userId,
  config,
  countTokens,
}: RetainedAnswersContextInput): Promise<string | undefined> {
  const resolved = resolveRetainedAnswersConfig(config);
  if (!resolved.enabled) {
    return undefined;
  }
  if (parentMessageId == null || parentMessageId === Constants.NO_PARENT) {
    return undefined;
  }
  let branch = orderConversationBranch(
    storedRows == null ? messages : [...storedRows, ...messages],
    parentMessageId,
  );
  if (storedRows == null && !reachesBranchRoot(branch)) {
    const load = resolveRowLoad(getMessages, conversationId, userId);
    const stored = load == null ? undefined : await load();
    if (stored != null) {
      branch = orderConversationBranch([...stored, ...messages], parentMessageId);
    }
  }
  const sets = collectRetainedAnswers(branch);
  return renderRetainedAnswers(sets, resolved.maxTokens, countTokens);
}

/**
 * The retained-answers block for one turn, or `undefined` when there is nothing
 * to carry or the block could not be built: a failure here costs the turn its
 * carried answers, never the turn, and is logged once per occurrence.
 */
export async function buildRetainedAnswersContext(
  input: RetainedAnswersContextInput,
): Promise<string | undefined> {
  try {
    return await buildContext(input);
  } catch (error) {
    logger.warn('[retainedAnswers] Block unavailable for this turn', getSafeErrorMetadata(error));
    return undefined;
  }
}

/**
 * Exact counting is limited to retained context. The general prompt counter's
 * 4 KiB byte-estimate shortcut would discard answers that fit the token budget.
 * Initialize lazily so disabled retention and histories without answers cost no
 * tokenizer load. Reuse this counter when applying the block to the final prompt.
 */
function countRetainedAnswerMessage(message: BaseMessage, encoding: EncodingName): number {
  const count = getTokenCountForMessage(
    message,
    (text) => {
      const tokens = Tokenizer.countExactTokens(text, encoding);
      if (tokens == null) {
        throw new Error('Retained-answer tokenizer unavailable');
      }
      return tokens;
    },
    encoding,
  );
  return encoding === 'claude' ? Math.ceil(count * CLAUDE_TOKEN_CORRECTION) : count;
}

async function createRetainedAnswerCounter(encoding: EncodingName): Promise<TokenCounter> {
  await Tokenizer.initEncoding(encoding);
  return (message) => countRetainedAnswerMessage(message, encoding);
}

/**
 * Wrap the initialized, cache-compatible run counter. Warm actors deliberately
 * discard positional counts, and checkpoint resumes reconstruct the messages,
 * so exact counting must follow the content through both paths. Matching the
 * user-context header survives serialization without a new persistence format
 * and remains a function of the SDK cache's content/role surface. All other
 * messages retain the ordinary counter's oversized-input guard.
 */
export function withRetainedAnswerTokenCounter(
  fallback: TokenCounter,
  encoding: EncodingName,
): TokenCounter {
  return markTokenCounterCacheCompatible((message) => {
    const content = message.content;
    const retained =
      message.getType() === 'human' &&
      (typeof content === 'string'
        ? content.includes(RETAINED_ANSWERS_HEADER)
        : Array.isArray(content) &&
          content.some(
            (part) =>
              part?.type === 'text' &&
              typeof part.text === 'string' &&
              part.text.includes(RETAINED_ANSWERS_HEADER),
          ));
    if (!retained) {
      return fallback(message);
    }
    try {
      return countRetainedAnswerMessage(message, encoding);
    } catch (error) {
      logger.warn(
        '[retainedAnswers] Exact recount unavailable; using the run counter',
        getSafeErrorMetadata(error),
      );
      return fallback(message);
    }
  });
}

/** The early admission count and the block share the final prompt's exact counter. */
export async function prepareRetainedAnswers(
  input: Omit<RetainedAnswersContextInput, 'countTokens'> & {
    countTokens?: RetainedAnswerTokenCounter;
    encoding?: EncodingName;
  },
): Promise<{ block?: string; tokenCount: number; tokenCounter?: TokenCounter }> {
  try {
    let tokenCounter: TokenCounter | undefined;
    const countTokens =
      input.countTokens ??
      (async (text: string) => {
        tokenCounter ??= await createRetainedAnswerCounter(input.encoding ?? 'o200k_base');
        return tokenCounter(new HumanMessage(text));
      });
    const block = await buildContext({ ...input, countTokens });
    return {
      block,
      tokenCount: block == null ? 0 : await measureTokens(block, countTokens),
      tokenCounter,
    };
  } catch (error) {
    logger.warn('[retainedAnswers] Block unavailable for this turn', getSafeErrorMetadata(error));
    return { tokenCount: 0 };
  }
}

/**
 * Apply after SDK summary slicing and replay. Before that boundary, the latest
 * user row can disappear together with its summary-covered prefix. A continued
 * assistant generation with no surviving human turn gets human context after any system prefix
 * and before the assistant continuation, leaving its unfinished assistant message last.
 *
 * The input remains the memory-extraction transcript. Clone only the affected
 * message and the two small containers, and commit nothing if counting fails.
 */
export function applyRetainedAnswers({
  block,
  messages,
  indexTokenCountMap = {},
  tokenCounter,
}: {
  block: string | null | undefined;
  messages: BaseMessage[];
  indexTokenCountMap?: Record<number, number>;
  tokenCounter: TokenCounter;
}): { messages: BaseMessage[]; indexTokenCountMap: Record<number, number> } {
  const unchanged = { messages, indexTokenCountMap };
  if (!block) {
    return unchanged;
  }
  try {
    let index = messages.length - 1;
    while (index >= 0 && messages[index].getType() !== 'human') {
      index--;
    }
    const target = index < 0 ? undefined : messages[index];
    const content = { content: target?.content ?? '' };
    prependContextText(content, block, SEPARATOR);
    const updated = withMessageRole(
      new HumanMessage({ ...target, content: target == null ? block : content.content }),
      'user',
    );
    const before = target == null ? 0 : tokenCounter(target);
    const after = tokenCounter(updated);
    if (!Number.isFinite(before) || !Number.isFinite(after) || before < 0 || after < 0) {
      throw new Error('Invalid retained-answer token count');
    }
    if (index < 0) {
      let insertion = 0;
      while (insertion < messages.length && messages[insertion].getType() === 'system') {
        insertion++;
      }
      const counts: Record<number, number> = { [insertion]: after };
      for (const [key, value] of Object.entries(indexTokenCountMap)) {
        const position = Number(key);
        counts[position < insertion ? position : position + 1] = value;
      }
      return {
        messages: [...messages.slice(0, insertion), updated, ...messages.slice(insertion)],
        indexTokenCountMap: counts,
      };
    }
    const copies = [...messages];
    copies[index] = updated;
    return {
      messages: copies,
      indexTokenCountMap: {
        ...indexTokenCountMap,
        [index]: (indexTokenCountMap[index] ?? before) + Math.max(0, after - before),
      },
    };
  } catch (error) {
    logger.warn(
      '[retainedAnswers] Prompt unchanged after application failure',
      getSafeErrorMetadata(error),
    );
    return unchanged;
  }
}
