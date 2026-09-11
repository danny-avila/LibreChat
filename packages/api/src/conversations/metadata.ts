import type {
  AppConfig,
  ConversationMethods,
  ConversationTagMethods,
} from '@librechat/data-schemas';
import type { FiltersConfig } from 'librechat-data-provider';
import { extractConversationTitleContent } from '../protection/adapters/submissions';
import { MAX_CONVERSATION_MANAGEMENT_TITLE_LENGTH } from './schema';
import { ContentFilterError } from '../middleware/contentFilter';
import { inspectContent } from '../protection/runtime';

export interface ConversationMetadataDependencies {
  saveConvo: ConversationMethods['saveConvo'];
  updateConversationResourceTags: ConversationTagMethods['updateConversationResourceTags'];
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
  title?: string;
  tags?: string[];
  isArchived?: boolean;
  filters?: FiltersConfig;
}

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
  deps: Pick<ConversationMetadataDependencies, 'saveConvo' | 'updateConversationResourceTags'>,
  input: ConversationMetadataUpdate,
): ReturnType<ConversationMethods['saveConvo']> {
  if (input.tags != null) {
    if (input.title != null || input.isArchived != null) {
      throw new Error('Tag changes require a separate PATCH');
    }
    return deps.updateConversationResourceTags(
      input.userId,
      input.conversationId,
      input.tags,
      input.tenantId ?? null,
    );
  }
  const update: { title?: string; isArchived?: boolean } = {};
  if (input.title != null) {
    const title = normalizeConversationTitle(input.title);
    const finding = inspectContent(extractConversationTitleContent({ title }), {
      filters: input.filters,
    });
    if (finding != null) throw new ContentFilterError(finding);
    update.title = title;
  }
  if (input.isArchived != null) update.isArchived = input.isArchived;

  return saveMetadata(
    deps.saveConvo,
    { userId: input.userId, interfaceConfig: input.interfaceConfig },
    { conversationId: input.conversationId, ...update },
    {
      context: `conversation metadata update ${input.conversationId}`,
      preserveUpdatedAt: input.title == null,
      noUpsert: true,
      tenantId: input.tenantId ?? null,
      appendMessageIds: [],
      requireVisible: true,
    },
  );
}
