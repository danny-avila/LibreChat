import { logger } from '@librechat/data-schemas';
import { Constants, ContentTypes, DEFAULT_RETAINED_ANSWER_TOKENS } from 'librechat-data-provider';
import type { TAskUserQuestionConfig } from 'librechat-data-provider';
import type { FormattedMessageWithContent } from '../client';
import { ASK_USER_QUESTION_TOOL_NAME } from './askUserQuestionTool';
import { prependContextText } from '../client';
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
  const rendered = sets.map(renderSet);
  const costs: number[] = [];
  let total = await countTokens(RETAINED_ANSWERS_HEADER);
  for (const text of rendered) {
    const cost = await countTokens(SEPARATOR + text);
    costs.push(cost);
    total += cost;
  }
  if (total <= maxTokens) {
    return [RETAINED_ANSWERS_HEADER, ...rendered].join(SEPARATOR);
  }
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
    if (index < sets.length - 1 && used + costs[index] > budget) {
      break;
    }
    used += costs[index];
    start = index;
  }
  let omitted = 0;
  for (let index = 0; index < start; index++) {
    omitted += sets[index].answers.length;
  }
  return [RETAINED_ANSWERS_HEADER, omittedNote(omitted), ...rendered.slice(start)].join(SEPARATOR);
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
  let branch = orderConversationBranch(messages, parentMessageId);
  if (!reachesBranchRoot(branch)) {
    const load = resolveRowLoad(getMessages, conversationId, userId);
    const stored = storedRows ?? (load == null ? undefined : await load());
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

export interface ApplyRetainedAnswersInput {
  /** The rendered block, or nothing to apply. */
  block: string | null | undefined;
  /** The rows the prompt was built from, in prompt order. */
  orderedMessages: readonly ({ isCreatedByUser?: boolean } | null | undefined)[];
  /** The prompt copies, index-aligned with `orderedMessages`; the chosen one is changed. */
  formattedMessages: FormattedMessageWithContent[];
  /** Prompt token count per index; the chosen index grows by the block. */
  indexTokenCountMap: Record<number, number | undefined>;
  /** Counts a prompt copy with the run's encoding. */
  countTokens: (message: FormattedMessageWithContent) => number | undefined;
  /**
   * Memory extraction reads a copy of the prompt without the block. `needed`
   * says whether that copy must still be built once the block is applied; `build`
   * builds it.
   */
  memoryCopy?: { needed: boolean; build: () => Promise<void> };
}

function latestUserAuthoredIndex(
  orderedMessages: ApplyRetainedAnswersInput['orderedMessages'],
): number {
  for (let index = orderedMessages.length - 1; index >= 0; index--) {
    if (orderedMessages[index]?.isCreatedByUser === true) {
      return index;
    }
  }
  return -1;
}

/**
 * Quotes the block into the latest user-authored prompt copy: the leaf on an
 * ordinary turn, the turn being continued when the leaf is the assistant's own
 * unfinished response. The block's cost is the difference between two fresh
 * counts of that copy, so a stored, calibrated count for the row is left as it
 * was. Returns the tokens added to the prompt, zero when nothing was applied.
 */
export async function applyRetainedAnswers({
  block,
  orderedMessages,
  formattedMessages,
  indexTokenCountMap,
  countTokens,
  memoryCopy,
}: ApplyRetainedAnswersInput): Promise<number> {
  if (block == null || block.length === 0) {
    return 0;
  }
  const index = latestUserAuthoredIndex(orderedMessages);
  const target = index < 0 ? undefined : formattedMessages[index];
  if (target == null) {
    return 0;
  }
  const before = countTokens(target) ?? 0;
  prependContextText(target, block, SEPARATOR);
  const added = Math.max(0, (countTokens(target) ?? 0) - before);
  indexTokenCountMap[index] = (indexTokenCountMap[index] ?? 0) + added;
  if (memoryCopy?.needed === true) {
    await memoryCopy.build();
  }
  return added;
}
