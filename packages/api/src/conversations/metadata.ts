import { logger } from '@librechat/data-schemas';
import type {
  AppConfig,
  ConversationMethods,
  ConversationResourceMethods,
  ConversationTagMethods,
} from '@librechat/data-schemas';
import type { FiltersConfig } from 'librechat-data-provider';
import { extractConversationTitleContent } from '../protection/adapters/submissions';
import { MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH } from './schema';
import { ContentFilterError } from '../middleware/contentFilter';
import { inspectContent } from '../protection/runtime';

export interface ConversationMetadataDependencies {
  saveConvo: ConversationMethods['saveConvo'];
  getConversationResource: ConversationResourceMethods['getConversationResource'];
  reconcileConversationTagCounts: ConversationTagMethods['reconcileConversationTagCounts'];
}

interface ConversationMetadataScope {
  userId: string;
  tenantId?: string;
  conversationId: string;
  interfaceConfig?: AppConfig['interfaceConfig'];
  /** Browser-only retention hint carried by the legacy mutation routes. */
  isTemporary?: boolean;
  expiredAt?: Date;
}

export interface ConversationTitleUpdate extends ConversationMetadataScope {
  title: string;
  filters?: FiltersConfig;
}

export interface ConversationArchiveUpdate extends ConversationMetadataScope {
  isArchived: boolean;
}

export interface ConversationMetadataUpdate extends ConversationMetadataScope {
  previousTags: string[];
  title?: string;
  tags?: string[];
  isArchived?: boolean;
  filters?: FiltersConfig;
}

const METADATA_UPDATE_ATTEMPTS = 4;

function isSaveConvoError(
  conversation: Awaited<ReturnType<ConversationMethods['saveConvo']>>,
): conversation is { message: string } {
  return (
    conversation != null &&
    'message' in conversation &&
    conversation.message === 'Error saving conversation'
  );
}

async function saveMetadata(
  saveConvo: ConversationMethods['saveConvo'],
  ...args: Parameters<ConversationMethods['saveConvo']>
): ReturnType<ConversationMethods['saveConvo']> {
  const conversation = await saveConvo(...args);
  if (isSaveConvoError(conversation)) throw new Error('Conversation metadata could not be saved');
  return conversation;
}

export function normalizeConversationTitle(title: string): string {
  return title.trim().slice(0, MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH);
}

export async function updateConversationTitleMetadata(
  deps: Pick<ConversationMetadataDependencies, 'saveConvo'>,
  input: ConversationTitleUpdate,
): ReturnType<ConversationMethods['saveConvo']> {
  const title = normalizeConversationTitle(input.title);
  const finding = inspectContent(extractConversationTitleContent({ title }), {
    filters: input.filters,
  });
  if (finding != null) throw new ContentFilterError(finding);
  return saveMetadata(
    deps.saveConvo,
    {
      userId: input.userId,
      interfaceConfig: input.interfaceConfig,
      isTemporary: input.isTemporary,
      expiredAt: input.expiredAt,
    },
    { conversationId: input.conversationId, title },
    {
      context: `conversation title update ${input.conversationId}`,
      noUpsert: true,
      tenantId: input.tenantId ?? null,
    },
  );
}

export async function updateConversationArchiveMetadata(
  deps: Pick<ConversationMetadataDependencies, 'saveConvo'>,
  input: ConversationArchiveUpdate,
): ReturnType<ConversationMethods['saveConvo']> {
  return saveMetadata(
    deps.saveConvo,
    {
      userId: input.userId,
      interfaceConfig: input.interfaceConfig,
      isTemporary: input.isTemporary,
      expiredAt: input.expiredAt,
    },
    { conversationId: input.conversationId, isArchived: input.isArchived },
    {
      context: `conversation archive update ${input.conversationId}`,
      preserveUpdatedAt: true,
      noUpsert: true,
      tenantId: input.tenantId ?? null,
    },
  );
}

export async function updateConversationMetadata(
  deps: Pick<
    ConversationMetadataDependencies,
    'saveConvo' | 'getConversationResource' | 'reconcileConversationTagCounts'
  >,
  input: ConversationMetadataUpdate,
): ReturnType<ConversationMethods['saveConvo']> {
  const update: { title?: string; tags?: string[]; isArchived?: boolean } = {};
  if (input.title != null) {
    const title = normalizeConversationTitle(input.title);
    const finding = inspectContent(extractConversationTitleContent({ title }), {
      filters: input.filters,
    });
    if (finding != null) throw new ContentFilterError(finding);
    update.title = title;
  }
  if (input.tags != null) update.tags = input.tags;
  if (input.isArchived != null) update.isArchived = input.isArchived;

  let previousTags = input.previousTags;
  for (let attempt = 0; attempt < METADATA_UPDATE_ATTEMPTS; attempt++) {
    const conversation = await saveMetadata(
      deps.saveConvo,
      { userId: input.userId, interfaceConfig: input.interfaceConfig },
      { conversationId: input.conversationId, ...update },
      {
        context: `conversation metadata update ${input.conversationId}`,
        preserveUpdatedAt: input.title == null && input.tags == null,
        noUpsert: true,
        tenantId: input.tenantId ?? null,
        appendMessageIds: [],
        requireVisible: true,
        ...(input.tags == null ? {} : { expectedTags: previousTags }),
      },
    );
    if (conversation != null) {
      if (input.tags != null) {
        try {
          await deps.reconcileConversationTagCounts(
            input.userId,
            previousTags,
            input.tags,
            input.tenantId ?? null,
          );
        } catch (error) {
          logger.error('[conversationMetadata] Failed to reconcile tag counts', error);
        }
      }
      return conversation;
    }
    if (input.tags == null) {
      return null;
    }
    const current = await deps.getConversationResource(
      input.userId,
      input.tenantId,
      input.conversationId,
    );
    if (current == null) return null;
    previousTags = current.tags ?? [];
  }
  throw new Error('Conversation metadata update conflicted too many times');
}
