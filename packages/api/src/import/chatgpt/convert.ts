import { v4 as uuidv4 } from 'uuid';
import { Tools, Constants, ContentTypes } from 'librechat-data-provider';
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

export interface ImportAttachment {
  type: Tools.web_search;
  [Tools.web_search]: SearchResultData;
}

export interface ImageFilePart {
  type: ContentTypes.IMAGE_FILE;
  [ContentTypes.IMAGE_FILE]: ImportedAsset;
}

export type ConvertedContentPart =
  | { type: 'think'; think: string }
  | { type: 'text'; text: string }
  | ImageFilePart
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
  assets: Map<string, ImportedAsset>;
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

/**
 * Assistant images render from nested `image_file` content parts
 * (`Part.tsx`), not from `message.files` — the only consumer of that field
 * is gated on `isCreatedByUser`. Non-image assets stay on `message.files`,
 * which the legacy renderer surfaces for messages that carry no content.
 */
function buildImageParts(files: ImportedAsset[]): ImageFilePart[] {
  const parts: ImageFilePart[] = [];
  for (const file of files) {
    if (file.type.startsWith('image/')) {
      parts.push({ type: ContentTypes.IMAGE_FILE, [ContentTypes.IMAGE_FILE]: file });
    }
  }
  return parts;
}

/**
 * Citations resolve through `SearchContext`, which only the content-part
 * renderer mounts: an assistant message routed to the legacy renderer
 * (`MultiMessage` dispatches on `message.content`) drops every anchor.
 * So content is emitted whenever the message carries reasoning, citation
 * attachments, or images — and withheld otherwise, leaving plain text on
 * the exact path it rendered on before.
 */
function buildContent(
  text: string,
  thinking: string | null,
  attachments: ImportAttachment[] | undefined,
  imageParts: ImageFilePart[],
): ConvertedContentPart[] | undefined {
  if (!thinking && !attachments && imageParts.length === 0) {
    return undefined;
  }

  const content: ConvertedContentPart[] = [];
  if (thinking) {
    content.push({ type: 'think', think: thinking });
  }
  content.push({ type: 'text', text });
  content.push(...imageParts);
  return content;
}

function buildById(messages: ConvertedMessage[]): Map<string, ConvertedMessage> {
  const byId = new Map<string, ConvertedMessage>();
  for (const message of messages) {
    byId.set(message.messageId, message);
  }
  return byId;
}

/**
 * Breaks any cycle in the parent graph by rooting the message that closes the
 * loop. Real exports occasionally reference an ancestor as its own descendant;
 * `buildTree` requires an acyclic graph so this must run before rendering.
 */
function breakCycles(messages: ConvertedMessage[], byId: Map<string, ConvertedMessage>): void {
  for (const message of messages) {
    const seen = new Set<string>([message.messageId]);
    let current = message.parentMessageId;
    while (current !== Constants.NO_PARENT) {
      const parent = byId.get(current);
      if (!parent) {
        break;
      }
      if (seen.has(current)) {
        message.parentMessageId = Constants.NO_PARENT;
        break;
      }
      seen.add(current);
      current = parent.parentMessageId;
    }
  }
}

/**
 * Nudges a child's timestamp past its parent's when the export's `create_time`
 * values are out of order, via a single BFS from the roots so every parent is
 * visited before its children.
 */
function enforceOrdering(messages: ConvertedMessage[], byId: Map<string, ConvertedMessage>): void {
  const children = new Map<string, ConvertedMessage[]>();
  for (const message of messages) {
    const siblings = children.get(message.parentMessageId);
    if (siblings) {
      siblings.push(message);
      continue;
    }
    children.set(message.parentMessageId, [message]);
  }

  const queue = [...(children.get(Constants.NO_PARENT) ?? [])];
  while (queue.length > 0) {
    const node = queue.shift() as ConvertedMessage;
    const parent = byId.get(node.parentMessageId);
    if (parent && node.createdAt.getTime() <= parent.createdAt.getTime()) {
      node.createdAt = new Date(parent.createdAt.getTime() + 1);
    }
    const kids = children.get(node.messageId);
    if (kids) {
      queue.push(...kids);
    }
  }
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
    const converted0 = convertContent(message, options.assets);
    const cited = isCreatedByUser
      ? { text: converted0.text, citations: [] }
      : buildCitations(message, converted0.text);
    const text = cited.text;
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

    if (!isCreatedByUser) {
      const thinking = findThinking(node.parent, mapping);
      const attachments = buildAttachments(cited.citations);
      const content = buildContent(text, thinking, attachments, buildImageParts(files));
      if (attachments) {
        converted.attachments = attachments;
      }
      if (content) {
        converted.content = content;
      }
    }

    if (files.length > 0) {
      converted.files = files;
    }

    messages.push(converted);
  }

  const byId = buildById(messages);
  breakCycles(messages, byId);
  enforceOrdering(messages, byId);

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
