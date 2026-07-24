import { v4 as uuidv4 } from 'uuid';
import { Tools, Constants } from 'librechat-data-provider';
import type { SearchResultData } from 'librechat-data-provider';
import type {
  ChatGptNode,
  ImportedAsset,
  ImportedCitations,
  ChatGptConversation,
} from '~/import/types';
import type { ContentPart } from './content';
import { convertContent, collectAssetPointers } from './content';
import { buildCitations } from './citations';
import { resolveModel } from './models';

const SKIPPED_CONTENT = new Set(['thoughts', 'reasoning_recap']);
const NO_ASSETS = new Map<string, ImportedAsset>();

export interface ImportAttachment {
  type: Tools.web_search;
  [Tools.web_search]: SearchResultData;
}

export type ConvertedContentPart =
  | { type: 'think'; think: string }
  | { type: 'text'; text: string }
  | ContentPart;

export interface ConvertedMessage {
  messageId: string;
  parentMessageId: string;
  text: string;
  sender: string;
  isCreatedByUser: boolean;
  model: string;
  createdAt: Date;
  content?: ConvertedContentPart[];
  attachments?: ImportAttachment[];
  files?: ImportedAsset[];
  assetPointers: string[];
}

export interface ConvertedConversation {
  conversationId: string;
  externalId: string;
  title: string;
  createdAt: Date;
  isArchived: boolean;
  pinned: boolean;
  model: string;
  messages: ConvertedMessage[];
}

export interface ConvertOptions {
  userId: string;
  assets: Map<string, string>;
  defaultModel: string;
}

function isEmitted(node: ChatGptNode): boolean {
  const message = node.message;
  if (!message?.content?.content_type) {
    return false;
  }
  if (message.author.role === 'system') {
    return false;
  }
  return !SKIPPED_CONTENT.has(message.content.content_type);
}

/**
 * Walks up `parent` links iteratively; recursion would overflow on the deep
 * chains real exports contain. `visited` breaks the cycles seen in the wild.
 */
function findParent(
  startId: string | null,
  mapping: Record<string, ChatGptNode>,
  ids: Map<string, string>,
): string {
  const visited = new Set<string>();
  let current = startId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const node = mapping[current];
    if (!node) {
      return Constants.NO_PARENT;
    }
    const mapped = ids.get(current);
    if (mapped && isEmitted(node)) {
      return mapped;
    }
    current = node.parent;
  }

  return Constants.NO_PARENT;
}

function findThinking(startId: string | null, mapping: Record<string, ChatGptNode>): string | null {
  const visited = new Set<string>();
  let current = startId;

  while (current && !visited.has(current)) {
    visited.add(current);
    const content = mapping[current]?.message?.content;
    if (!content) {
      return null;
    }
    if (content.content_type === 'thoughts') {
      const thoughts = content.thoughts ?? [];
      const joined = thoughts
        .map((thought) => thought.content || thought.summary || '')
        .filter((entry) => entry.length > 0)
        .join('\n\n');
      return joined.length > 0 ? joined : null;
    }
    if (content.content_type !== 'reasoning_recap') {
      return null;
    }
    current = mapping[current].parent;
  }

  return null;
}

function buildAttachments(citations: ImportedCitations[]): ImportAttachment[] | undefined {
  if (citations.length === 0) {
    return undefined;
  }
  return citations.map((citation) => ({
    type: Tools.web_search,
    [Tools.web_search]: citation.data,
  }));
}

export function convertConversation(
  conv: ChatGptConversation,
  options: ConvertOptions,
): ConvertedConversation {
  const mapping = conv.mapping ?? {};
  const ids = new Map<string, string>();

  for (const [nodeId, node] of Object.entries(mapping)) {
    if (isEmitted(node)) {
      ids.set(nodeId, uuidv4());
    }
  }

  const fallbackTime = conv.create_time ? conv.create_time * 1000 : Date.now();
  const messages: ConvertedMessage[] = [];

  for (const [nodeId, node] of Object.entries(mapping)) {
    const messageId = ids.get(nodeId);
    if (!messageId || !node.message) {
      continue;
    }

    const message = node.message;
    const isCreatedByUser = message.author.role === 'user';
    const converted0 = convertContent(message, NO_ASSETS);
    const cited = isCreatedByUser
      ? { text: converted0.text, citations: [] }
      : buildCitations(message, converted0.text);
    const text = cited.text;
    const parts = converted0.parts.map((part) =>
      part.type === 'text' ? { type: 'text' as const, text } : part,
    );
    const files = converted0.files;
    const { model, sender } = resolveModel(
      message.metadata?.model_slug ?? conv.default_model_slug ?? undefined,
      options.defaultModel,
    );

    const converted: ConvertedMessage = {
      messageId,
      parentMessageId: findParent(node.parent, mapping, ids),
      text,
      sender: isCreatedByUser ? 'user' : sender,
      isCreatedByUser,
      model,
      createdAt: new Date(message.create_time ? message.create_time * 1000 : fallbackTime),
      assetPointers: collectAssetPointers(message),
    };

    const thinking = isCreatedByUser ? null : findThinking(node.parent, mapping);
    if (thinking) {
      converted.content = [{ type: 'think', think: thinking }, ...parts];
    } else if (parts.length > 1 || parts.some((part) => part.type !== 'text')) {
      converted.content = parts;
    }

    if (!isCreatedByUser) {
      converted.attachments = buildAttachments(cited.citations);
    }

    if (files.length > 0) {
      converted.files = files;
    }

    messages.push(converted);
  }

  const { model } = resolveModel(conv.default_model_slug ?? undefined, options.defaultModel);

  return {
    conversationId: uuidv4(),
    externalId: conv.conversation_id,
    title: conv.title || 'Imported Chat',
    createdAt: new Date(fallbackTime),
    isArchived: conv.is_archived === true,
    pinned: conv.is_starred === true || conv.pinned_time != null,
    model,
    messages,
  };
}
