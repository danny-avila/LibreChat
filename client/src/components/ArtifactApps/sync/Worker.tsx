import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  DEFAULT_ARTIFACT_APPS_CONFIG,
  Permissions,
  PermissionTypes,
  QueryKeys,
  dataService,
} from 'librechat-data-provider';
import {
  completeArtifactSync,
  listArtifactSyncQueue,
  rescheduleArtifactSync,
  subscribeToArtifactSyncQueue,
} from './queue';
import { useGetStartupConfig } from '~/data-provider';
import useHasAccess from '~/hooks/Roles/useHasAccess';
import { useAuthContext } from '~/hooks';
import { logger } from '~/utils';

interface SyncHttpError {
  response?: { status?: number };
}

function shouldDiscardSyncError(error: unknown): boolean {
  const status = (error as SyncHttpError | null)?.response?.status;
  return status === 400 || status === 403 || status === 410 || status === 413 || status === 422;
}

/** Flushes the persistent registration queue for the signed-in user across route changes. */
export default function ArtifactSyncWorker() {
  const { user } = useAuthContext();
  const ownerId = user?.id;
  const queryClient = useQueryClient();
  const { data: startupConfig } = useGetStartupConfig();
  const retryBaseDelayMs =
    startupConfig?.artifactApps?.clientSyncRetryBaseDelayMs ??
    DEFAULT_ARTIFACT_APPS_CONFIG.clientSyncRetryBaseDelayMs;
  const retryMaxDelayMs =
    startupConfig?.artifactApps?.clientSyncRetryMaxDelayMs ??
    DEFAULT_ARTIFACT_APPS_CONFIG.clientSyncRetryMaxDelayMs;
  const canCreate = useHasAccess({
    permissionType: PermissionTypes.ARTIFACTS,
    permission: Permissions.CREATE,
  });
  const flushingRef = useRef(false);
  const lifecycleGenerationRef = useRef(0);
  const activeOwnerRef = useRef(ownerId);
  const canCreateRef = useRef(canCreate);
  activeOwnerRef.current = ownerId;
  canCreateRef.current = canCreate;

  const flush = useCallback(async () => {
    if (!ownerId || !canCreate) {
      return null;
    }
    if (flushingRef.current) {
      return Math.min(retryBaseDelayMs, 100);
    }
    flushingRef.current = true;
    const generation = lifecycleGenerationRef.current;
    let catalogChanged = false;
    const sessionIsActive = () =>
      lifecycleGenerationRef.current === generation &&
      activeOwnerRef.current === ownerId &&
      canCreateRef.current === true;
    try {
      const entries = (await listArtifactSyncQueue(ownerId)).sort(
        (left, right) => left.nextAttemptAt - right.nextAttemptAt,
      );
      for (const entry of entries) {
        if (!sessionIsActive()) {
          return null;
        }
        if (entry.nextAttemptAt > Date.now()) {
          continue;
        }
        try {
          const result = await dataService.syncArtifactApp(entry.request);
          if (!sessionIsActive()) {
            return null;
          }
          queryClient.setQueryData(
            [
              QueryKeys.artifactApp,
              'source',
              entry.request.source.conversationId,
              entry.request.source.sourceKey,
            ],
            result,
          );
          await completeArtifactSync(entry.id, entry.signature);
          catalogChanged = true;
        } catch (error) {
          if (!sessionIsActive()) {
            return null;
          }
          if (!shouldDiscardSyncError(error)) {
            const delay = Math.min(
              retryBaseDelayMs * 2 ** Math.min(entry.failures, 5),
              retryMaxDelayMs,
            );
            await rescheduleArtifactSync(entry.id, entry.signature, delay);
          } else {
            await completeArtifactSync(entry.id, entry.signature);
          }
          logger.error('artifacts', 'Failed to sync artifact with catalog', error);
        }
      }
      if (catalogChanged && sessionIsActive()) {
        await queryClient.invalidateQueries({
          queryKey: [QueryKeys.artifactApps],
          refetchType: 'all',
        });
        if (!sessionIsActive()) {
          queryClient.removeQueries({ queryKey: [QueryKeys.artifactApps] });
          return null;
        }
      }
      if (!sessionIsActive()) {
        return null;
      }
      const remaining = await listArtifactSyncQueue(ownerId);
      return remaining.length > 0
        ? Math.max(0, Math.min(...remaining.map((entry) => entry.nextAttemptAt)) - Date.now())
        : null;
    } finally {
      flushingRef.current = false;
    }
  }, [canCreate, ownerId, queryClient, retryBaseDelayMs, retryMaxDelayMs]);

  useEffect(() => {
    const lifecycleGeneration = ++lifecycleGenerationRef.current;
    let disposed = false;
    let timer: number | null = null;
    const schedule = (delay: number) => {
      if (disposed) {
        return;
      }
      if (timer != null) {
        window.clearTimeout(timer);
      }
      timer = window.setTimeout(() => void run(), delay);
    };
    async function run() {
      timer = null;
      try {
        const nextDelay = await flush();
        if (!disposed && nextDelay != null) {
          schedule(nextDelay);
        }
      } catch (error) {
        logger.error('artifacts', 'Artifact synchronization worker failed', error);
        schedule(retryBaseDelayMs);
      }
    }
    const unsubscribe = subscribeToArtifactSyncQueue(() => schedule(0));
    void run();
    return () => {
      disposed = true;
      if (lifecycleGenerationRef.current === lifecycleGeneration) {
        lifecycleGenerationRef.current += 1;
      }
      unsubscribe();
      if (timer != null) {
        window.clearTimeout(timer);
      }
    };
  }, [flush, retryBaseDelayMs]);

  return null;
}
