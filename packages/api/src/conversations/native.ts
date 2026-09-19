import { getNativeContinuationRefs, resolveMediaConfig } from 'librechat-data-provider';
import type {
  AppConfig,
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
> &
  ConversationImportMethods;

/** A local copy is a new durable consumer; only portable imports discard native identity. */
export async function saveNativeConversationClone(input: {
  scope: MediaOwnerScope;
  sourceConversationId: string;
  conversationId: string;
  messages: ReadonlyArray<Pick<TMessage, 'content'>>;
  appConfig?: Pick<AppConfig, 'media'>;
  loadConfig: () => Promise<Pick<AppConfig, 'media'>>;
  repository: NativeCloneRepository;
  save: () => Promise<void>;
  onCleanupError?: (error: Error) => void;
}): Promise<void> {
  const refs = new Set<string>();
  for (const message of input.messages) {
    for (const ref of getNativeContinuationRefs(message.content)) refs.add(ref);
  }
  if (!refs.size) return input.save();
  if (input.conversationId === input.sourceConversationId) {
    throw new ConversationImportError('A native conversation copy requires a new identity', 400);
  }
  const config = resolveMediaConfig((input.appConfig ?? (await input.loadConfig())).media);
  const identity = { scope: input.scope, conversationId: input.conversationId };
  const claim = () =>
    input.repository.retainMediaNativeConversation({
      ...identity,
      continuationRefs: Array.from(refs),
      maxRetainers: config.limits.maxAssetRetainers,
      limit: refs.size,
      pendingUntil: new Date(Date.now() + config.worker.leaseMs).toISOString(),
    });
  let renewal: Promise<void> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  try {
    if (!(await claim()))
      throw new ConversationImportError('Native conversation content is no longer available', 409);
    timer = setInterval(() => {
      if (renewal) return;
      renewal = claim()
        .then(
          () => undefined,
          (error: Error) => {
            input.onCleanupError?.(error);
          },
        )
        .finally(() => {
          renewal = undefined;
        });
    }, config.worker.renewEveryMs);
    timer.unref();
    await input.save();
    if (!(await claim()))
      throw new ConversationImportError('Native conversation content is no longer available', 409);
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
    if (timer) clearInterval(timer);
    await renewal;
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
