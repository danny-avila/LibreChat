import {
  collectMessageFileIds,
  removeMessageFileIds,
  isMediaFileId,
} from '@librechat/data-schemas';
import {
  detachNativeIdentity,
  getNativeContinuationRefs,
  parseNativeMessageReference,
  resolveMediaConfig,
} from 'librechat-data-provider';
import type {
  AppConfig,
  MediaMethods,
  MediaNativeMethods,
  MediaOwnerScope,
  ConversationImportMethods,
} from '@librechat/data-schemas';
import type { TMessage } from 'librechat-data-provider';
import { ConversationImportError } from './import';

type NativeCloneRepository = Pick<
  MediaNativeMethods,
  | 'retainMediaNativeConversation'
  | 'confirmMediaNativeConversation'
  | 'reconcileMediaNativeMessageDeletion'
  | 'detachMediaNativeConversation'
> &
  Pick<MediaMethods, 'getMediaAssetContent'> &
  ConversationImportMethods;

/** A local copy is a new durable consumer; only portable imports discard native identity. */
export async function saveNativeConversationClone(input: {
  scope: MediaOwnerScope;
  sourceConversationId: string;
  conversationId: string;
  messages: ReadonlyArray<Pick<TMessage, 'content' | 'files' | 'attachments'>>;
  appConfig?: Pick<AppConfig, 'media'>;
  loadConfig: () => Promise<Pick<AppConfig, 'media'>>;
  repository: NativeCloneRepository;
  save: () => Promise<void>;
  onCleanupError?: (error: Error) => void;
}): Promise<void> {
  const refs = new Set<string>();
  const fileIds = new Set<string>();
  for (const message of input.messages) {
    for (const ref of getNativeContinuationRefs(message.content))
      if (!parseNativeMessageReference(ref)) refs.add(ref);
    for (const fileId of collectMessageFileIds(message))
      if (isMediaFileId(fileId)) fileIds.add(fileId);
  }
  if (input.conversationId === input.sourceConversationId) {
    throw new ConversationImportError('A native conversation copy requires a new identity', 400);
  }
  const unavailable = new Set<string>();
  for (const fileId of fileIds) {
    if (!(await input.repository.getMediaAssetContent(input.scope, fileId)))
      unavailable.add(fileId);
  }
  if (unavailable.size)
    for (const message of input.messages)
      Object.assign(message, removeMessageFileIds(message, unavailable));
  if (!refs.size) return input.save();
  const config = resolveMediaConfig((input.appConfig ?? (await input.loadConfig())).media);
  const identity = { scope: input.scope, conversationId: input.conversationId };
  try {
    await input.save();
    for (const ref of refs) {
      if (
        await input.repository.retainMediaNativeConversation({
          ...identity,
          continuationRefs: [ref],
          maxRetainers: config.limits.maxAssetRetainers,
          limit: 1,
        })
      )
        continue;
      await input.repository.detachMediaNativeConversation({
        ...identity,
        continuationRefs: [ref],
      });
      for (const message of input.messages) {
        message.content = message.content?.map((part) =>
          part && typeof part === 'object' && getNativeContinuationRefs([part]).includes(ref)
            ? detachNativeIdentity(part)
            : part,
        );
      }
    }
  } catch (error) {
    const cleanup = {
      user: input.scope.ownerId,
      conversationIds: [input.conversationId],
      ...(input.scope.tenantId == null ? {} : { tenantId: input.scope.tenantId }),
    };
    try {
      await input.repository.deleteImportedMessages(cleanup);
      await input.repository.deleteImportedConversations(cleanup);
    } catch (cleanupError) {
      input.onCleanupError?.(
        cleanupError instanceof Error ? cleanupError : new Error('Native clone cleanup failed'),
      );
    }
    throw error;
  } finally {
    try {
      await input.repository.confirmMediaNativeConversation(identity);
      await input.repository.reconcileMediaNativeMessageDeletion(identity);
    } catch (cleanupError) {
      input.onCleanupError?.(
        cleanupError instanceof Error
          ? cleanupError
          : new Error('Native clone consumer cleanup failed'),
      );
    }
  }
}
