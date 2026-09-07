import { nanoid } from 'nanoid';
import { Constants } from 'librechat-data-provider';
import { isRetentionVisible } from '@librechat/data-schemas';
import type {
  ConversationMethods,
  IConversation,
  IMessage,
  MessageMethods,
} from '@librechat/data-schemas';
import type { OutputItem, Response, Usage } from './types';

export interface StoredResponseLookup {
  getConvo(userId: string, conversationId: string): Promise<IConversation | null>;
  getMessage(input: { user: string; messageId: string }): Promise<IMessage | null>;
}

export interface StoredResponseConversationLookup {
  getConvo(userId: string, conversationId: string): Promise<IConversation | null>;
}

export interface StoredResponseReference {
  conversation: IConversation;
  conversationId: string;
  responseMessage: IMessage | null;
}

export type StoredResponseResolution =
  | { status: 'found'; reference: StoredResponseReference }
  | { status: 'not_found' }
  | { status: 'read_only' };

export interface StoredResponseSnapshot {
  response?: Response;
  output: OutputItem[];
  usage?: Usage | null;
  previousResponseId: string | null;
}

export interface StoredResponseInputMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<{ type: string; text?: string; image_url?: unknown }>;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

export interface StoredResponseWriteDependencies {
  saveConvo: ConversationMethods['saveConvo'];
  saveMessage: MessageMethods['saveMessage'];
  getConvo: ConversationMethods['getConvo'];
  getMessage: MessageMethods['getMessage'];
  commitStoredResponseTurn: MessageMethods['commitStoredResponseTurn'];
  deleteStoredResponseTurn: MessageMethods['deleteStoredResponseTurn'];
  createMessageId?: () => string;
}

export interface PersistStoredResponseParams {
  deps: StoredResponseWriteDependencies;
  context: Parameters<MessageMethods['saveMessage']>[0];
  conversation: {
    data: Parameters<ConversationMethods['saveConvo']>[1];
    initialAgentId: string | null;
    isContinuation: boolean;
  };
  inputMessages: StoredResponseInputMessage[];
  parentMessageId: string | null;
  responseId: string;
  response: Response;
  agentId: string;
  visibleOutputTokens?: number;
  getOutputMessageFields?: () => Promise<Partial<IMessage> | undefined>;
}

const RESPONSE_SNAPSHOT_VERSION = 1;
const MAX_PERSISTENCE_WRITE_ATTEMPTS = 2;

interface StoredResponseRecord extends StoredResponseSnapshot {
  version: typeof RESPONSE_SNAPSHOT_VERSION;
  commitState: 'pending' | 'committed';
}

interface StoredResponseTurn {
  version: typeof RESPONSE_SNAPSHOT_VERSION;
  responseId: string;
}

const classifyConversation = (
  conversation: IConversation | null,
): 'found' | 'not_found' | 'read_only' => {
  if (conversation == null || !isRetentionVisible(conversation)) {
    return 'not_found';
  }
  return conversation.subagentThread == null ? 'found' : 'read_only';
};

const normalizeDocumentId = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  const normalized = String(value);
  return normalized.length > 0 ? normalized : null;
};

const isExpectedConversation = (
  conversation: IConversation | { message: string } | null | undefined,
  conversationId: string,
): conversation is IConversation =>
  conversation != null &&
  'conversationId' in conversation &&
  conversation.conversationId === conversationId;

const includesEveryMessageId = (
  conversation: IConversation,
  messageIds: readonly unknown[],
): boolean => {
  if (!Array.isArray(conversation.messages)) {
    return false;
  }
  const committedIds = new Set(conversation.messages.map(normalizeDocumentId));
  return messageIds.every((id) => {
    const normalized = normalizeDocumentId(id);
    return normalized != null && committedIds.has(normalized);
  });
};

function getStoredResponseTurn(message: IMessage): StoredResponseTurn | null {
  const turn = message.metadata?.responsesTurn;
  if (turn == null || typeof turn !== 'object' || Array.isArray(turn)) {
    return null;
  }
  const stored = turn as Record<string, unknown>;
  if (stored.version !== RESPONSE_SNAPSHOT_VERSION || typeof stored.responseId !== 'string') {
    return null;
  }
  return { version: RESPONSE_SNAPSHOT_VERSION, responseId: stored.responseId };
}

function hasStoredResponseTurnMarker(message: IMessage): boolean {
  return Object.prototype.hasOwnProperty.call(message.metadata ?? {}, 'responsesTurn');
}

export function isStoredResponseOutput(message: IMessage): boolean {
  return (
    message.isCreatedByUser !== true &&
    message.isUserSubmitted !== true &&
    message.metadata?.responsesInput == null
  );
}

function getStoredResponseRecord(message: IMessage): StoredResponseRecord | null {
  const snapshot = message.metadata?.responsesResponse;
  if (snapshot == null || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    return null;
  }
  const stored = snapshot as Record<string, unknown>;
  const response = stored.response as Response | undefined;
  if (
    response != null &&
    (response.id !== message.messageId ||
      response.object !== 'response' ||
      response.status !== 'completed' ||
      !Array.isArray(response.output))
  ) {
    return null;
  }
  const output = response?.output ?? stored.output;
  const usage = response == null ? stored.usage : response.usage;
  const previousResponseId =
    response == null ? stored.previousResponseId : response.previous_response_id;
  if (
    stored.version !== RESPONSE_SNAPSHOT_VERSION ||
    (stored.commitState !== 'pending' && stored.commitState !== 'committed') ||
    !Array.isArray(output) ||
    (usage != null && typeof usage !== 'object') ||
    (previousResponseId != null && typeof previousResponseId !== 'string')
  ) {
    return null;
  }
  return {
    version: RESPONSE_SNAPSHOT_VERSION,
    commitState: stored.commitState,
    ...(response != null && { response }),
    output: output as OutputItem[],
    usage: (usage ?? null) as Usage | null,
    previousResponseId: previousResponseId ?? null,
  };
}

function isCommittedTurnOutput(message: IMessage, responseId: string): boolean {
  const turn = getStoredResponseTurn(message);
  const record = getStoredResponseRecord(message);
  return (
    turn?.responseId === responseId &&
    message.messageId === responseId &&
    message.isCreatedByUser === false &&
    message.isUserSubmitted === false &&
    isStoredResponseOutput(message) &&
    record?.commitState === 'committed'
  );
}

function responseTurnKey(message: IMessage, responseId: string): string {
  return `${String(message.user)}\u0000${message.conversationId}\u0000${responseId}`;
}

export function filterCommittedResponseMessages(messages: IMessage[]): IMessage[] {
  const committedTurns = new Set<string>();
  for (const message of messages) {
    const responseId = getStoredResponseTurn(message)?.responseId;
    if (responseId != null && isCommittedTurnOutput(message, responseId)) {
      committedTurns.add(responseTurnKey(message, responseId));
    }
  }
  return messages.filter((message) => {
    const responseId = getStoredResponseTurn(message)?.responseId;
    if (responseId == null) {
      return !hasStoredResponseTurnMarker(message);
    }
    return committedTurns.has(responseTurnKey(message, responseId));
  });
}

export function isCommittedStoredResponse(message: IMessage): boolean {
  const turn = getStoredResponseTurn(message);
  if (turn == null) {
    return !hasStoredResponseTurnMarker(message);
  }
  return isCommittedTurnOutput(message, turn.responseId);
}

export function buildStoredResponseMetadata(
  response: Response,
  commitState: StoredResponseRecord['commitState'] = 'pending',
): Record<string, unknown> {
  return {
    responsesTurn: {
      version: RESPONSE_SNAPSHOT_VERSION,
      responseId: response.id,
    },
    responsesResponse: {
      version: RESPONSE_SNAPSHOT_VERSION,
      commitState,
      response,
    },
  };
}

export function getStoredResponseSnapshot(message: IMessage): StoredResponseSnapshot | null {
  const metadata = message.metadata;
  const record = getStoredResponseRecord(message);
  if (record != null) {
    return {
      ...(record.response != null && { response: record.response }),
      output: record.output,
      usage: record.usage,
      previousResponseId: record.previousResponseId,
    };
  }

  const legacyOutput = metadata?.responsesOutput;
  if (!Array.isArray(legacyOutput)) {
    return null;
  }
  return {
    output: legacyOutput as OutputItem[],
    previousResponseId:
      typeof metadata?.responsesPreviousResponseId === 'string'
        ? metadata.responsesPreviousResponseId
        : null,
  };
}

export async function resolveStoredResponse(
  deps: StoredResponseLookup,
  userId: string,
  responseId: string,
): Promise<StoredResponseResolution> {
  if (!responseId.startsWith('resp_')) {
    const conversation = await deps.getConvo(userId, responseId);
    const status = classifyConversation(conversation);
    if (status === 'not_found') {
      return { status: 'not_found' };
    }
    if (status === 'read_only') {
      return { status: 'read_only' };
    }
    if (conversation == null) {
      return { status: 'not_found' };
    }
    return {
      status: 'found',
      reference: {
        conversation,
        conversationId: conversation.conversationId,
        responseMessage: null,
      },
    };
  }

  const responseMessage = await deps.getMessage({ user: userId, messageId: responseId });
  if (
    responseMessage == null ||
    responseMessage.isCreatedByUser !== false ||
    !isStoredResponseOutput(responseMessage) ||
    typeof responseMessage.conversationId !== 'string' ||
    !isRetentionVisible(responseMessage)
  ) {
    return { status: 'not_found' };
  }
  const conversation = await deps.getConvo(userId, responseMessage.conversationId);
  const status = classifyConversation(conversation);
  if (status === 'not_found') {
    return { status: 'not_found' };
  }
  if (status === 'read_only') {
    return { status: 'read_only' };
  }
  if (conversation == null || !isCommittedStoredResponse(responseMessage)) {
    return { status: 'not_found' };
  }
  return {
    status: 'found',
    reference: {
      conversation,
      conversationId: conversation.conversationId,
      responseMessage,
    },
  };
}

export async function revalidateStoredResponseConversation(
  deps: StoredResponseConversationLookup,
  userId: string,
  reference: StoredResponseReference,
): Promise<StoredResponseResolution> {
  const conversation = await deps.getConvo(userId, reference.conversationId);
  const status = classifyConversation(conversation);
  if (status === 'not_found' || conversation == null) {
    return { status: 'not_found' };
  }
  if (status === 'read_only') {
    return { status: 'read_only' };
  }
  if (reference.responseMessage != null && !isCommittedStoredResponse(reference.responseMessage)) {
    return { status: 'not_found' };
  }
  return {
    status: 'found',
    reference: {
      conversation,
      conversationId: conversation.conversationId,
      responseMessage: reference.responseMessage,
    },
  };
}

export function selectStoredResponseHistory(
  messages: IMessage[],
  responseMessageId?: string,
): IMessage[] {
  if (responseMessageId == null) {
    return messages;
  }
  const targetIndex = messages.findIndex((message) => message.messageId === responseMessageId);
  if (targetIndex < 0) {
    return [];
  }
  const target = messages[targetIndex];
  const rootParent = (parentMessageId: string | null | undefined): boolean =>
    parentMessageId == null || parentMessageId === String(Constants.NO_PARENT);
  if (rootParent(target.parentMessageId)) {
    const legacyHistory = messages.slice(0, targetIndex + 1);
    return legacyHistory.every((message) => rootParent(message.parentMessageId))
      ? legacyHistory
      : [target];
  }

  const byId = new Map<string, IMessage>();
  for (const message of messages) {
    if (typeof message.messageId === 'string') {
      byId.set(message.messageId, message);
    }
  }
  const selected: IMessage[] = [];
  const seen = new Set<string>();
  let current: IMessage | undefined = target;
  while (current != null && typeof current.messageId === 'string' && !seen.has(current.messageId)) {
    selected.push(current);
    seen.add(current.messageId);
    const parentMessageId: string | null | undefined = current.parentMessageId;
    current =
      rootParent(parentMessageId) || typeof parentMessageId !== 'string'
        ? undefined
        : byId.get(parentMessageId);
  }
  if (
    current != null ||
    !rootParent(selected.length === 0 ? undefined : selected[selected.length - 1].parentMessageId)
  ) {
    return [];
  }

  const linkedHistory = selected.reverse();
  const rootIndex = messages.indexOf(linkedHistory[0]);
  const legacyPrefix = messages.slice(0, rootIndex);
  return legacyPrefix.every((message) => rootParent(message.parentMessageId))
    ? [...legacyPrefix, ...linkedHistory]
    : linkedHistory;
}

async function saveConversationFence(params: PersistStoredResponseParams): Promise<IConversation> {
  const { deps, context, conversation } = params;
  const conversationId = conversation.data.conversationId;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PERSISTENCE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const stored = await deps.saveConvo(context, conversation.data, {
        context: 'Responses API - save conversation',
        initialAgentId: conversation.initialAgentId,
        appendMessageIds: [],
        ...(conversation.isContinuation && { noUpsert: true }),
      });
      if (isExpectedConversation(stored, conversationId)) {
        return stored;
      }
    } catch (error) {
      lastError = error;
    }

    const current = await deps.getConvo(context.userId, conversationId);
    if (current != null) {
      return current;
    }
    if (conversation.isContinuation) {
      throw new Error('Conversation was deleted before the response could be stored');
    }
  }

  if (lastError != null) {
    throw lastError;
  }
  throw new Error('Conversation could not be initialized for response storage');
}

async function commitMessageManifest(
  params: PersistStoredResponseParams,
  messageIds: NonNullable<IMessage['_id']>[],
): Promise<IConversation> {
  const { deps, context, conversation } = params;
  const conversationId = conversation.data.conversationId;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PERSISTENCE_WRITE_ATTEMPTS; attempt += 1) {
    let stored: IConversation | { message: string } | null = null;
    try {
      stored = await deps.saveConvo(context, conversation.data, {
        context: 'Responses API - save conversation',
        initialAgentId: conversation.initialAgentId,
        appendMessageIds: messageIds,
        noUpsert: true,
      });
    } catch (error) {
      lastError = error;
    }

    if (
      isExpectedConversation(stored, conversationId) &&
      includesEveryMessageId(stored, messageIds)
    ) {
      return stored;
    }
    const current = await deps.getConvo(context.userId, conversationId);
    if (current == null) {
      throw new Error('Conversation was deleted before message references were stored');
    }
    if (includesEveryMessageId(current, messageIds)) {
      return current;
    }
  }

  if (lastError != null) {
    throw lastError;
  }
  throw new Error('Response message references could not be committed');
}

async function commitResponseMarker(params: PersistStoredResponseParams): Promise<IMessage> {
  const { deps, context, conversation, responseId } = params;
  const conversationId = conversation.data.conversationId;
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_PERSISTENCE_WRITE_ATTEMPTS; attempt += 1) {
    try {
      const committed = await deps.commitStoredResponseTurn({
        userId: context.userId,
        conversationId,
        responseId,
      });
      if (
        committed?.conversationId === conversationId &&
        isCommittedTurnOutput(committed, responseId)
      ) {
        return committed;
      }
    } catch (error) {
      lastError = error;
    }

    try {
      const current = await deps.getMessage({ user: context.userId, messageId: responseId });
      if (
        current?.conversationId === conversationId &&
        isCommittedTurnOutput(current, responseId)
      ) {
        return current;
      }
      if (current == null || current.conversationId !== conversationId) {
        throw new Error('Response output was deleted before the turn could be committed');
      }
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError != null) {
    throw lastError;
  }
  throw new Error('Response output could not be committed');
}

async function cleanupResponseTurn(params: PersistStoredResponseParams): Promise<void> {
  try {
    await params.deps.deleteStoredResponseTurn({
      userId: params.context.userId,
      conversationId: params.conversation.data.conversationId,
      responseId: params.responseId,
    });
  } catch {
    return;
  }
}

function getResponseText(response: Response): string {
  let responseText = '';
  for (const item of response.output) {
    if (item.type !== 'message') {
      continue;
    }
    for (const part of item.content) {
      if (part.type === 'output_text' && part.text) {
        responseText += part.text;
      }
    }
  }
  return responseText;
}

export async function persistStoredResponse(
  params: PersistStoredResponseParams,
): Promise<{ conversation: IConversation; outputMessage: IMessage }> {
  const { deps, context, conversation, inputMessages, response, responseId, agentId } = params;
  await saveConversationFence(params);

  let markerAttempted = false;
  try {
    const createMessageId = deps.createMessageId ?? nanoid;
    const messageIds: NonNullable<IMessage['_id']>[] = [];
    let currentParentMessageId = params.parentMessageId;
    for (const input of inputMessages) {
      const messageId = createMessageId();
      let sender = 'Agent';
      if (input.role === 'user') {
        sender = 'User';
      } else if (input.role === 'tool') {
        sender = 'Tool';
      }
      const stored = await deps.saveMessage(
        context,
        {
          messageId,
          conversationId: conversation.data.conversationId,
          parentMessageId: currentParentMessageId,
          isCreatedByUser: input.role === 'user',
          isUserSubmitted: true,
          text: typeof input.content === 'string' ? input.content : JSON.stringify(input.content),
          ...(Array.isArray(input.content) && { content: input.content }),
          sender,
          endpoint: conversation.data.endpoint as string | undefined,
          model: agentId,
          metadata: {
            responsesTurn: {
              version: RESPONSE_SNAPSHOT_VERSION,
              responseId,
            },
            responsesInput: {
              role: input.role,
              ...(typeof input.name === 'string' && { name: input.name }),
              ...(typeof input.tool_call_id === 'string' && { tool_call_id: input.tool_call_id }),
              ...(Array.isArray(input.tool_calls) && { tool_calls: input.tool_calls }),
            },
          },
        },
        { context: 'Responses API - save input' },
      );
      if (stored?._id == null) {
        throw new Error(`Response input message could not be stored: ${messageId}`);
      }
      messageIds.push(stored._id);
      currentParentMessageId = messageId;
    }

    const outputMessageFields = (await params.getOutputMessageFields?.()) ?? {};
    const outputMessage = await deps.saveMessage(
      context,
      {
        ...outputMessageFields,
        messageId: responseId,
        conversationId: conversation.data.conversationId,
        parentMessageId: currentParentMessageId,
        isCreatedByUser: false,
        isUserSubmitted: false,
        text: getResponseText(response),
        sender: 'Agent',
        endpoint: conversation.data.endpoint as string | undefined,
        model: agentId,
        finish_reason: response.status === 'completed' ? 'stop' : response.status,
        tokenCount: params.visibleOutputTokens ?? response.usage?.output_tokens,
        metadata: buildStoredResponseMetadata(response),
      },
      { context: 'Responses API - save assistant response' },
    );
    if (outputMessage?._id == null) {
      throw new Error(`Response output message could not be stored: ${responseId}`);
    }
    messageIds.push(outputMessage._id);

    const committedConversation = await commitMessageManifest(params, messageIds);
    markerAttempted = true;
    const committedOutput = await commitResponseMarker(params);
    return { conversation: committedConversation, outputMessage: committedOutput };
  } catch (error) {
    if (!markerAttempted) {
      await cleanupResponseTurn(params);
    }
    throw error;
  }
}
