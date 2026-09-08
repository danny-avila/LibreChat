import { z } from 'zod';
import { BSON, ObjectId } from 'mongodb';
import { Constants, tMessageSchema, tPresetSchema } from 'librechat-data-provider';
import type { AppConfig } from '@librechat/data-schemas';
import type { Document } from 'mongodb';
import {
  MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH,
  conversationTagsSchema,
  conversationFileSchema,
  isValidConversationContentPart,
} from './schema';
import {
  CONTENT_TRAVERSAL_MAX_DEPTH,
  CONTENT_TRAVERSAL_MAX_NODES,
} from '~/protection/adapters/nested';
import { resolveImportMaxFileSize } from '~/utils/import';

type JsonPrimitive = boolean | number | string | null;
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

interface JsonObject {
  [key: string]: JsonValue;
}

interface ImportFileInfo {
  size: number;
}

export type ConversationImportFormat = 'any' | 'librechat';

export interface ConversationImportJob {
  filepath: string;
  requestUserId: string;
  userRole?: string;
  interfaceConfig?: AppConfig['interfaceConfig'];
  filters?: AppConfig['filters'];
  legacyPii?: NonNullable<AppConfig['messageFilter']>['pii'];
  format?: ConversationImportFormat;
  allowTags?: boolean;
}

export type ConversationImporter<TBuilder> = (
  jsonData: JsonValue,
  requestUserId: string,
  builderFactory: (requestUserId: string) => TBuilder,
  userRole?: string,
) => Promise<void>;

export interface ConversationImportDependencies<TBuilder> {
  statFile: (filepath: string) => Promise<ImportFileInfo>;
  readFile: (filepath: string, encoding: 'utf8') => Promise<string>;
  unlinkFile: (filepath: string) => Promise<void>;
  getImporter: (jsonData: JsonValue) => ConversationImporter<TBuilder>;
  createBuilder: (
    requestUserId: string,
    interfaceConfig?: AppConfig['interfaceConfig'],
    filters?: AppConfig['filters'],
    legacyPii?: NonNullable<AppConfig['messageFilter']>['pii'],
  ) => TBuilder;
  maxFileSize?: number;
  onCleanupError?: (error: Error, filepath: string, requestUserId: string) => void;
}

const importMetadataSchema = z.object({
  endpoint: z.string().nullish(),
  title: z.string().nullish(),
  exportAt: z.string().optional(),
});

const TOP_LEVEL_FIELDS = new Set([
  'conversationId',
  'endpoint',
  'title',
  'exportAt',
  'branches',
  'recursive',
  'options',
  'messages',
  'messagesTree',
]);

const UNSAFE_OPTION_FIELDS = new Set([
  'messages',
  'chatProjectId',
  'subagentThread',
  'expiredAt',
  'isTemporary',
  'parentMessageId',
  'presetOverride',
]);

const SOURCE_PROVENANCE_FIELDS = ['_id', '__v', 'user', 'tenantId'] as const;
const OPTION_FIELDS = new Set([
  ...Object.keys(tPresetSchema.shape).filter((field) => !UNSAFE_OPTION_FIELDS.has(field)),
  ...SOURCE_PROVENANCE_FIELDS,
]);
const COERCED_NUMBER_OPTION_FIELDS = [
  'maxOutputTokens',
  'maxContextTokens',
  'max_tokens',
  'thinkingBudget',
  'maxTokens',
  'fileTokenLimit',
] as const;

const SOURCE_RETENTION_FIELDS = ['isTemporary', 'expiredAt'] as const;
const UNSAFE_MESSAGE_FIELDS = new Set(['contextMeta']);
const importMessageSchema = tMessageSchema.extend({ addedConvo: z.boolean().optional() });
const MESSAGE_FIELDS = new Set([
  ...Object.keys(importMessageSchema.shape).filter((field) => !UNSAFE_MESSAGE_FIELDS.has(field)),
  'children',
  'content',
  'files',
  'depth',
  'siblingIndex',
  'attachments',
  ...SOURCE_RETENTION_FIELDS,
  ...SOURCE_PROVENANCE_FIELDS,
]);

const OWNERSHIP_FIELDS = new Set([
  'user',
  'userid',
  'owner',
  'ownerid',
  'tenant',
  'tenantid',
  'principal',
  'principalid',
  'createdby',
  'updatedby',
]);

export class ConversationImportError extends Error {
  readonly code: 'invalid_request' | 'permission_denied';
  readonly statusCode: number;
  readonly body: { error: 'invalid_request' | 'permission_denied'; message: string };

  constructor(message: string, statusCode: number, options?: ErrorOptions);

  constructor(
    message: string,
    options?: ErrorOptions & {
      code?: 'invalid_request' | 'permission_denied';
      statusCode?: number;
    },
  );

  constructor(
    message: string,
    statusCodeOrOptions?:
      | number
      | (ErrorOptions & {
          code?: 'invalid_request' | 'permission_denied';
          statusCode?: number;
        }),
    legacyOptions?: ErrorOptions,
  ) {
    const options =
      typeof statusCodeOrOptions === 'number'
        ? { ...legacyOptions, statusCode: statusCodeOrOptions }
        : statusCodeOrOptions;
    super(message, options);
    this.name = 'ConversationImportError';
    this.code = options?.code ?? 'invalid_request';
    this.statusCode = options?.statusCode ?? (this.code === 'permission_denied' ? 403 : 400);
    this.body = { error: this.code, message };
  }
}

export const MAX_CONVERSATION_IMPORT_BSON_BYTES: number = 16 * 1024 * 1024;
export const CONVERSATION_IMPORT_BSON_HEADROOM_BYTES: number = 64 * 1024;
export const MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES: number =
  MAX_CONVERSATION_IMPORT_BSON_BYTES - CONVERSATION_IMPORT_BSON_HEADROOM_BYTES;

export interface ConversationImportWriteBatch {
  conversations: readonly Document[];
  messages: readonly Document[];
  tenantId?: string;
}

export interface ConversationImportWriteOperations {
  saveConversations: () => Promise<void>;
  saveMessages: () => Promise<void>;
  updateTagCounts: () => Promise<void>;
  deleteMessages: () => Promise<void>;
  deleteConversations: () => Promise<void>;
  onTagCountError?: (error: Error) => void;
  onCleanupError?: (error: Error, resource: 'messages' | 'conversations') => void;
}

function importWriteError(
  message: string,
  statusCode: number,
  cause?: unknown,
): ConversationImportError {
  return new ConversationImportError(message, {
    statusCode,
    ...(cause === undefined ? {} : { cause }),
  });
}

export function assertConversationImportWriteSize(batch: ConversationImportWriteBatch): void {
  const assertDocumentSize = (document: Document): void => {
    let size: number;
    try {
      size = BSON.calculateObjectSize({
        ...document,
        _id: new ObjectId(),
        __v: 0,
        ...(batch.tenantId == null ? {} : { tenantId: batch.tenantId }),
      });
    } catch (error) {
      throw importWriteError('An imported conversation or message cannot be stored', 400, error);
    }
    if (size > MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES) {
      throw importWriteError(
        `Each imported conversation or message must be at most ${MAX_CONVERSATION_IMPORT_DOCUMENT_BYTES} bytes`,
        413,
      );
    }
  };
  for (const conversation of batch.conversations) {
    assertDocumentSize(conversation);
  }
  for (const message of batch.messages) {
    assertDocumentSize(message);
  }
}

export async function executeConversationImportWrites(
  operations: ConversationImportWriteOperations,
): Promise<void> {
  try {
    await operations.saveConversations();
    await operations.saveMessages();
  } catch (error) {
    try {
      await operations.deleteMessages();
    } catch (cleanupError) {
      operations.onCleanupError?.(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Failed to clean imported messages'),
        'messages',
      );
      throw error;
    }

    try {
      await operations.deleteConversations();
    } catch (cleanupError) {
      operations.onCleanupError?.(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Failed to clean imported conversations'),
        'conversations',
      );
    }
    throw error;
  }

  try {
    await operations.updateTagCounts();
  } catch (error) {
    operations.onTagCountError?.(
      error instanceof Error ? error : new Error('Failed to update imported tag counts'),
    );
  }
}

export function isConversationImportError(error: unknown): error is ConversationImportError {
  return error instanceof ConversationImportError;
}

function isJsonObject(value: JsonValue | undefined): value is JsonObject {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function assertAllowedFields(value: JsonObject, allowed: Set<string>, location: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new ConversationImportError(`Field "${location}.${key}" cannot be imported`);
    }
  }
}

function normalizedFieldName(value: string): string {
  return value.replaceAll('_', '').replaceAll('-', '').toLowerCase();
}

interface TraversalBudget {
  nodes: number;
}

function reserveTraversalNode(depth: number, budget: TraversalBudget): void {
  budget.nodes++;
  if (depth > CONTENT_TRAVERSAL_MAX_DEPTH || budget.nodes > CONTENT_TRAVERSAL_MAX_NODES) {
    throw new ConversationImportError('The uploaded conversation structure exceeds import limits');
  }
}

function assertImportTraversal(value: JsonValue, depth: number, budget: TraversalBudget): void {
  reserveTraversalNode(depth, budget);
  if (Array.isArray(value)) {
    for (const nested of value) assertImportTraversal(nested, depth + 1, budget);
  } else if (isJsonObject(value)) {
    for (const key in value) assertImportTraversal(value[key], depth + 1, budget);
  }
}

function assertNoOwnershipFields(value: JsonValue, location: string): void {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      assertNoOwnershipFields(value[index], `${location}[${index}]`);
    }
    return;
  }
  if (!isJsonObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (key === '_id' || key === '__v' || OWNERSHIP_FIELDS.has(normalizedFieldName(key))) {
      throw new ConversationImportError(`Field "${location}.${key}" cannot be imported`);
    }
    assertNoOwnershipFields(nested, `${location}.${key}`);
  }
}

function stripOwnershipFields(value: JsonValue): void {
  if (Array.isArray(value)) {
    for (const nested of value) {
      stripOwnershipFields(nested);
    }
    return;
  }
  if (!isJsonObject(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (key === '_id' || key === '__v' || OWNERSHIP_FIELDS.has(normalizedFieldName(key))) {
      delete value[key];
      continue;
    }
    stripOwnershipFields(nested);
  }
}

function assertMessage(
  value: JsonValue,
  location: string,
  recursive: boolean,
  messageIds: Set<string>,
): asserts value is JsonObject {
  if (!isJsonObject(value)) {
    throw new ConversationImportError(`Field "${location}" must be a message object`);
  }
  assertAllowedFields(value, MESSAGE_FIELDS, location);
  for (const field of SOURCE_RETENTION_FIELDS) delete value[field];
  const parsedMessage = importMessageSchema.safeParse(value);
  if (!parsedMessage.success) {
    throw new ConversationImportError(`Field "${location}" is not a valid message`, {
      cause: parsedMessage.error,
    });
  }
  const id = parsedMessage.data.messageId;
  if (!id || id === Constants.NO_PARENT || messageIds.has(id)) {
    throw new ConversationImportError(`Field "${location}" must have a unique message ID`);
  }
  messageIds.add(id);
  for (const field of ['createdAt', 'updatedAt', 'clientTimestamp'] as const) {
    const timestamp = value[field];
    if (
      timestamp !== undefined &&
      (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp)))
    ) {
      throw new ConversationImportError(`Field "${location}.${field}" must be a valid date`);
    }
  }
  for (const field of ['content', 'files', 'attachments'] as const) {
    if (value[field] !== undefined && !Array.isArray(value[field])) {
      throw new ConversationImportError(`Field "${location}.${field}" must be an array`);
    }
  }
  if (Array.isArray(value.content)) {
    for (let index = 0; index < value.content.length; index++) {
      if (!isValidConversationContentPart(value.content[index])) {
        throw new ConversationImportError(
          `Field "${location}.content[${index}]" is not a supported content part`,
        );
      }
    }
  }
  for (const field of ['files', 'attachments'] as const) {
    const entries = value[field];
    if (!Array.isArray(entries)) continue;
    for (let index = 0; index < entries.length; index++) {
      if (!conversationFileSchema.safeParse(entries[index]).success) {
        throw new ConversationImportError(
          `Field "${location}.${field}[${index}]" is not a supported file object`,
        );
      }
    }
  }
  if (
    recursive &&
    !value.text &&
    value.content === undefined &&
    ((Array.isArray(value.files) && value.files.length > 0) ||
      (Array.isArray(value.attachments) && value.attachments.length > 0))
  ) {
    value.content = [];
  }
  for (const field of ['depth', 'siblingIndex'] as const) {
    const ordinal = value[field];
    if (
      ordinal !== undefined &&
      (typeof ordinal !== 'number' || !Number.isInteger(ordinal) || ordinal < 0)
    ) {
      throw new ConversationImportError(
        `Field "${location}.${field}" must be a non-negative integer`,
      );
    }
  }
  for (const field of [...SOURCE_PROVENANCE_FIELDS, 'thread_id'] as const) {
    delete value[field];
  }

  if (value.metadata != null) {
    assertNoOwnershipFields(value.metadata, `${location}.metadata`);
  }
  if (value.feedback != null) {
    assertNoOwnershipFields(value.feedback, `${location}.feedback`);
  }
  if (value.files != null) {
    stripOwnershipFields(value.files);
  }
  if (value.attachments != null) {
    stripOwnershipFields(value.attachments);
  }

  if (value.children == null) return;
  if (!Array.isArray(value.children)) {
    throw new ConversationImportError(`Field "${location}.children" must be an array`);
  }
  if (value.children.length > 0 && !recursive) {
    throw new ConversationImportError(`Field "${location}.children" requires recursive import`);
  }
  if (value.children.length > 0 && !value.text && !value.content) {
    throw new ConversationImportError(
      `Field "${location}" cannot have children when its message body is empty`,
    );
  }
  for (let index = 0; index < value.children.length; index++) {
    assertMessage(value.children[index], `${location}.children[${index}]`, recursive, messageIds);
  }
}

function assertMessages(
  value: JsonValue | undefined,
  location: string,
  recursive: boolean,
): JsonObject[] {
  if (!Array.isArray(value)) {
    throw new ConversationImportError(`Field "${location}" must be an array`);
  }
  const messages: JsonObject[] = [];
  const messageIds = new Set<string>();
  const children = new Map<string, JsonObject[]>();
  const ordered: JsonObject[] = [];
  for (let index = 0; index < value.length; index++) {
    const message = value[index];
    assertMessage(message, `${location}[${index}]`, recursive, messageIds);
    messages.push(message);
    if (recursive) continue;
    const parentId = message.parentMessageId as string | undefined;
    if (!parentId || parentId === Constants.NO_PARENT) {
      ordered.push(message);
      continue;
    }
    const siblings = children.get(parentId) ?? [];
    siblings.push(message);
    children.set(parentId, siblings);
  }
  if (recursive) return messages;
  for (const parentId of children.keys()) {
    if (!messageIds.has(parentId)) {
      throw new ConversationImportError(`Field "${location}" references a missing parent`);
    }
  }
  for (let index = 0; index < ordered.length; index++) {
    for (const child of children.get(ordered[index].messageId as string) ?? []) {
      ordered.push(child);
    }
  }
  if (ordered.length !== messages.length) {
    throw new ConversationImportError(`Field "${location}" contains a parent cycle`);
  }
  return ordered;
}

export function prepareLibreChatConversationImport(
  value: JsonValue,
  allowTags = false,
): JsonObject {
  if (!isJsonObject(value)) {
    throw new ConversationImportError('The uploaded file is not a LibreChat conversation export');
  }
  assertImportTraversal(value, 0, { nodes: 0 });
  assertAllowedFields(value, TOP_LEVEL_FIELDS, 'conversation');
  if (typeof value.conversationId !== 'string' || value.conversationId.length === 0) {
    throw new ConversationImportError('A LibreChat conversationId is required');
  }
  const metadata = importMetadataSchema.safeParse(value);
  if (!metadata.success) {
    throw new ConversationImportError('The exported conversation metadata is not valid', {
      cause: metadata.error,
    });
  }
  if (
    typeof value.title === 'string' &&
    value.title.length > MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH
  ) {
    throw new ConversationImportError(
      `Field "conversation.title" cannot exceed ${MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH} characters`,
    );
  }
  for (const field of ['branches', 'recursive'] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new ConversationImportError(`Field "conversation.${field}" must be a boolean`);
    }
  }

  if (value.options != null) {
    if (!isJsonObject(value.options)) {
      throw new ConversationImportError('Field "conversation.options" must be an object');
    }
    assertAllowedFields(value.options, OPTION_FIELDS, 'conversation.options');
    const parsedOptions = tPresetSchema.safeParse(value.options);
    if (!parsedOptions.success) {
      throw new ConversationImportError('Field "conversation.options" is not valid', {
        cause: parsedOptions.error,
      });
    }
    for (const field of COERCED_NUMBER_OPTION_FIELDS) {
      const parsedNumber = parsedOptions.data[field];
      if (parsedNumber != null && !Number.isFinite(parsedNumber)) {
        throw new ConversationImportError(
          `Field "conversation.options.${field}" must be a finite number`,
        );
      }
      if (parsedNumber === undefined) {
        delete value.options[field];
      } else {
        value.options[field] = parsedNumber;
      }
    }
    if (value.options.tags !== undefined && !allowTags) {
      throw new ConversationImportError('Importing conversation tags requires bookmark access', {
        code: 'permission_denied',
      });
    }
    if (value.options.tags !== undefined) {
      const tags = conversationTagsSchema.safeParse(value.options.tags);
      if (!tags.success) {
        throw new ConversationImportError('Field "conversation.options.tags" is not valid', {
          cause: tags.error,
        });
      }
      value.options.tags = tags.data;
    }
    for (const field of [...SOURCE_PROVENANCE_FIELDS, 'conversationId', 'file_ids'] as const) {
      delete value.options[field];
    }
  }

  const hasMessages = value.messages !== undefined;
  const hasMessagesTree = value.messagesTree !== undefined;
  if (hasMessages === hasMessagesTree) {
    throw new ConversationImportError('Exactly one LibreChat message collection is required');
  }
  if (hasMessagesTree && value.recursive !== true) {
    throw new ConversationImportError(
      'The recursive flag must match the LibreChat message collection shape',
    );
  }
  const messages = assertMessages(
    hasMessages ? value.messages : value.messagesTree,
    hasMessages ? 'conversation.messages' : 'conversation.messagesTree',
    value.recursive === true,
  );
  value[hasMessages ? 'messages' : 'messagesTree'] = messages;
  return value;
}

function parseJson(fileData: string, strict: boolean): JsonValue {
  try {
    return JSON.parse(fileData) as JsonValue;
  } catch (error) {
    if (!strict) throw error;
    throw new ConversationImportError('The uploaded file is not valid JSON', { cause: error });
  }
}

export function createConversationImportOperation<TBuilder>(
  deps: ConversationImportDependencies<TBuilder>,
): (job: ConversationImportJob) => Promise<void> {
  return async function importConversation(job: ConversationImportJob): Promise<void> {
    const strict = job.format === 'librechat';
    try {
      const fileInfo = await deps.statFile(job.filepath);
      const maxFileSize = deps.maxFileSize ?? resolveImportMaxFileSize();
      if (fileInfo.size > maxFileSize) {
        const message = `File size is ${fileInfo.size} bytes. It exceeds the maximum limit of ${maxFileSize} bytes.`;
        if (strict) throw new ConversationImportError(message);
        throw new Error(message);
      }

      const jsonData = parseJson(await deps.readFile(job.filepath, 'utf8'), strict);
      const importData = strict
        ? prepareLibreChatConversationImport(jsonData, job.allowTags === true)
        : jsonData;

      let importer: ConversationImporter<TBuilder>;
      try {
        importer = deps.getImporter(importData);
      } catch (error) {
        if (!strict) throw error;
        throw new ConversationImportError(
          'The uploaded file is not a LibreChat conversation export',
          {
            cause: error,
          },
        );
      }

      await importer(
        importData,
        job.requestUserId,
        (requestUserId) =>
          deps.createBuilder(requestUserId, job.interfaceConfig, job.filters, job.legacyPii),
        job.userRole,
      );
    } finally {
      try {
        await deps.unlinkFile(job.filepath);
      } catch (error) {
        deps.onCleanupError?.(
          error instanceof Error ? error : new Error('Failed to remove import file'),
          job.filepath,
          job.requestUserId,
        );
      }
    }
  };
}
