import { useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import {
  Constants,
  DEFAULT_ARTIFACT_APPS_CONFIG,
  Permissions,
  PermissionTypes,
} from 'librechat-data-provider';
import type { TSyncArtifactAppRequest } from 'librechat-data-provider';
import { enqueueArtifactSync } from '~/components/ArtifactApps/sync/queue';
import { toLatestArtifactSyncRequests } from '~/utils/artifactCatalog';
import { useGetStartupConfig } from '~/data-provider';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useArtifactsContext } from '~/Providers';
import { useAuthContext } from '~/hooks';
import { logger } from '~/utils';
import store from '~/store';

function getSyncKey(request: TSyncArtifactAppRequest): string {
  return `${request.source.conversationId}\u0000${request.source.sourceKey}`;
}

function getRequestSignature(request: TSyncArtifactAppRequest): string {
  return JSON.stringify(request);
}

/** Detects artifacts created by completed generations and persists work for the global worker. */
export default function ArtifactCatalogRegistrar() {
  const artifacts = useRecoilValue(store.artifactsState);
  const { conversationId, isSubmitting, latestMessageId } = useArtifactsContext();
  const { user } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const syncSettleDelayMs =
    startupConfig?.artifactApps?.clientSyncSettleDelayMs ??
    DEFAULT_ARTIFACT_APPS_CONFIG.clientSyncSettleDelayMs;
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.ARTIFACTS,
    permission: Permissions.CREATE,
  });
  const previousIsSubmittingRef = useRef(false);
  const conversationRef = useRef<string | null>(null);
  const activeGenerationConversationRef = useRef<string | null>(null);
  const activeGenerationMessageRef = useRef<string | null>(null);
  /**
   * Completed message ids stay eligible for the lifetime of the active
   * conversation. Deferred office previews expose no reliable client-side ETA,
   * so a wall-clock expiry would silently lose slow but valid conversions.
   * Conversation navigation clears the set and keeps history reads inert.
   */
  const completedGenerationMessagesRef = useRef(new Set<string>());
  const observedSignaturesRef = useRef(new Map<string, string>());

  useEffect(() => {
    const validConversation =
      conversationId != null && conversationId !== Constants.NEW_CONVO ? conversationId : null;
    const requests =
      validConversation && artifacts
        ? toLatestArtifactSyncRequests(artifacts, validConversation)
        : [];
    const wasSubmitting = previousIsSubmittingRef.current;
    previousIsSubmittingRef.current = isSubmitting;

    if (conversationRef.current !== validConversation) {
      conversationRef.current = validConversation;
      activeGenerationConversationRef.current = null;
      activeGenerationMessageRef.current = null;
      completedGenerationMessagesRef.current.clear();
      observedSignaturesRef.current.clear();
      if (!isSubmitting) {
        for (const request of requests) {
          observedSignaturesRef.current.set(getSyncKey(request), getRequestSignature(request));
        }
      } else if (validConversation) {
        activeGenerationConversationRef.current = validConversation;
        activeGenerationMessageRef.current = latestMessageId;
      }
    }

    if (isSubmitting && !wasSubmitting) {
      activeGenerationConversationRef.current = validConversation;
      activeGenerationMessageRef.current = latestMessageId;
    } else if (isSubmitting && activeGenerationConversationRef.current === validConversation) {
      activeGenerationMessageRef.current = latestMessageId ?? activeGenerationMessageRef.current;
    }

    if (
      !isSubmitting &&
      wasSubmitting &&
      activeGenerationConversationRef.current === validConversation
    ) {
      const completedMessageId = latestMessageId ?? activeGenerationMessageRef.current;
      if (completedMessageId) {
        completedGenerationMessagesRef.current.add(completedMessageId);
      }
      activeGenerationConversationRef.current = null;
      activeGenerationMessageRef.current = null;
    }

    if (!canCreate || !user?.id || !validConversation) {
      return;
    }

    for (const request of requests) {
      const messageId = request.source.messageId;
      if (!messageId || !completedGenerationMessagesRef.current.has(messageId)) {
        continue;
      }
      const syncKey = getSyncKey(request);
      const signature = getRequestSignature(request);
      if (observedSignaturesRef.current.get(syncKey) === signature) {
        continue;
      }
      observedSignaturesRef.current.set(syncKey, signature);
      void enqueueArtifactSync(user.id, request, signature, syncSettleDelayMs).catch((error) => {
        if (observedSignaturesRef.current.get(syncKey) === signature) {
          observedSignaturesRef.current.delete(syncKey);
        }
        logger.error('artifacts', 'Failed to persist artifact catalog registration', error);
      });
    }
  }, [
    artifacts,
    canCreate,
    conversationId,
    isSubmitting,
    latestMessageId,
    syncSettleDelayMs,
    user?.id,
  ]);

  return null;
}
