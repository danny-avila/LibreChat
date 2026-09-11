import { useCallback, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  Permissions,
  PermissionTypes,
  QueryKeys,
  dataService,
} from 'librechat-data-provider';
import type { TSyncArtifactAppRequest } from 'librechat-data-provider';
import { toLatestArtifactSyncRequests } from '~/utils/artifactCatalog';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useArtifactsContext } from '~/Providers';
import { logger } from '~/utils';
import store from '~/store';

const SYNC_SETTLE_DELAY_MS = 500;
const SYNC_RETRY_BASE_DELAY_MS = 1000;
const SYNC_RETRY_MAX_DELAY_MS = 30_000;

interface PendingSync {
  request: TSyncArtifactAppRequest;
  signature: string;
  failures: number;
}

interface SyncHttpError {
  response?: { status?: number };
}

function getSyncKey(request: TSyncArtifactAppRequest): string {
  return `${request.source.conversationId}\u0000${request.source.sourceKey}`;
}

function getRequestSignature(request: TSyncArtifactAppRequest): string {
  return JSON.stringify(request);
}

function isRetryableSyncError(error: unknown): boolean {
  const status = (error as SyncHttpError | null)?.response?.status;
  return status == null || status === 408 || status === 429 || status >= 500;
}

/** Persists artifacts created or changed by a completed generation. */
export default function ArtifactCatalogRegistrar() {
  const artifacts = useRecoilValue(store.artifactsState);
  const { conversationId, isSubmitting, latestMessageId } = useArtifactsContext();
  const queryClient = useQueryClient();
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.ARTIFACTS,
    permission: Permissions.CREATE,
  });
  const previousIsSubmittingRef = useRef(false);
  const generationConversationRef = useRef<string | null>(null);
  const generationMessageRef = useRef<string | null>(null);
  const successfulHashesRef = useRef(new Map<string, string>());
  const pendingSyncsRef = useRef(new Map<string, PendingSync>());
  const syncTimerRef = useRef<number | null>(null);
  const flushPendingRef = useRef<() => Promise<void>>(async () => undefined);
  const mountedRef = useRef(true);
  const flushingRef = useRef(false);

  const scheduleSync = useCallback((delay: number) => {
    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current);
    }
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void flushPendingRef.current();
    }, delay);
  }, []);

  const flushPending = useCallback(async () => {
    if (flushingRef.current || !canCreate || pendingSyncsRef.current.size === 0) {
      return;
    }
    flushingRef.current = true;
    let completed = false;

    for (const [syncKey, pending] of Array.from(pendingSyncsRef.current.entries())) {
      if (!mountedRef.current) {
        break;
      }
      try {
        const result = await dataService.syncArtifactApp(pending.request);
        queryClient.setQueryData(
          [
            QueryKeys.artifactApp,
            'source',
            pending.request.source.conversationId,
            pending.request.source.sourceKey,
          ],
          result,
        );
        successfulHashesRef.current.set(syncKey, pending.signature);
        if (pendingSyncsRef.current.get(syncKey)?.signature === pending.signature) {
          pendingSyncsRef.current.delete(syncKey);
        }
        completed = true;
      } catch (error) {
        const current = pendingSyncsRef.current.get(syncKey);
        if (current?.signature === pending.signature) {
          if (isRetryableSyncError(error)) {
            pendingSyncsRef.current.set(syncKey, { ...current, failures: current.failures + 1 });
          } else {
            pendingSyncsRef.current.delete(syncKey);
          }
        }
        logger.error('artifacts', 'Failed to sync artifact with catalog', error);
      }
    }

    flushingRef.current = false;
    if (!mountedRef.current) {
      return;
    }
    if (completed) {
      await queryClient.invalidateQueries({
        queryKey: [QueryKeys.artifactApps],
        refetchType: 'all',
      });
    }
    if (pendingSyncsRef.current.size > 0) {
      const failures = Math.min(
        ...Array.from(pendingSyncsRef.current.values(), ({ failures }) => failures),
      );
      scheduleSync(
        Math.min(SYNC_RETRY_BASE_DELAY_MS * 2 ** Math.min(failures, 5), SYNC_RETRY_MAX_DELAY_MS),
      );
    }
  }, [canCreate, queryClient, scheduleSync]);

  useEffect(() => {
    flushPendingRef.current = flushPending;
  }, [flushPending]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const wasSubmitting = previousIsSubmittingRef.current;
    previousIsSubmittingRef.current = isSubmitting;
    const validConversation =
      conversationId != null && conversationId !== Constants.NEW_CONVO ? conversationId : null;

    if (isSubmitting) {
      if (!wasSubmitting && validConversation) {
        const baselineRequests = artifacts
          ? toLatestArtifactSyncRequests(artifacts, validConversation)
          : [];
        for (const request of baselineRequests) {
          successfulHashesRef.current.set(getSyncKey(request), getRequestSignature(request));
        }
      }
      generationConversationRef.current = validConversation;
      generationMessageRef.current = latestMessageId;
      return;
    }

    const generationConversation = generationConversationRef.current;
    if (wasSubmitting && generationConversation) {
      generationMessageRef.current = latestMessageId;
    }
    const observingGeneration =
      canCreate && generationConversation != null && generationConversation === validConversation;
    if (!observingGeneration || !artifacts) {
      return;
    }

    let queued = false;
    const requests = toLatestArtifactSyncRequests(artifacts, generationConversation);
    for (const request of requests) {
      if (
        generationMessageRef.current == null ||
        request.source.messageId !== generationMessageRef.current
      ) {
        continue;
      }
      const syncKey = getSyncKey(request);
      const signature = getRequestSignature(request);
      if (successfulHashesRef.current.get(syncKey) === signature) {
        continue;
      }
      const current = pendingSyncsRef.current.get(syncKey);
      pendingSyncsRef.current.set(syncKey, {
        request,
        signature,
        failures: current?.signature === signature ? current.failures : 0,
      });
      queued = true;
    }
    if (queued || pendingSyncsRef.current.size > 0) {
      scheduleSync(SYNC_SETTLE_DELAY_MS);
    }
  }, [artifacts, canCreate, conversationId, isSubmitting, latestMessageId, scheduleSync]);

  return null;
}
