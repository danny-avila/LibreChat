import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys } from 'librechat-data-provider';
import { useToastContext } from '@librechat/client';
import type { TSkillStatesResponse } from 'librechat-data-provider';
import {
  useGetSkillStatesQuery,
  useUpdateSkillStatesMutation,
  useGetStartupConfig,
} from '~/data-provider';
import { useAuthContext, useLocalize } from '~/hooks';
import { logger } from '~/utils';

const EMPTY_STATES: TSkillStatesResponse = {};

interface WriteQueue {
  pending: TSkillStatesResponse | null;
  inFlight: boolean;
}

/**
 * Module-scoped, per-user write queues so every hook instance (SkillList,
 * SkillDetail, etc.) shares a single in-flight slot for the active user.
 * Per-instance refs let two components race full-map POSTs and drop toggles
 * via last-writer-wins. Keying by `userId` prevents pending writes from
 * leaking across account transitions in the same browser tab (logout/login
 * flushing a previous user's snapshot into the new session).
 */
const writeQueues = new Map<string, WriteQueue>();

function getWriteQueue(userId: string): WriteQueue {
  let queue = writeQueues.get(userId);
  if (!queue) {
    queue = { pending: null, inFlight: false };
    writeQueues.set(userId, queue);
  }
  return queue;
}

/**
 * Resolves the default active state for a skill the user has never toggled.
 *
 * - Owned skills (author === currentUser) default to **active**.
 * - Shared skills default to the `defaultActiveOnShare` config value (default `false`).
 */
function resolveDefault(author: string, userId: string, defaultActiveOnShare: boolean): boolean {
  return author === userId ? true : defaultActiveOnShare;
}

/**
 * Hook for managing per-user skill active/inactive state.
 *
 * The `skillStates` map stores explicit overrides (`{ [skillId]: boolean }`).
 * Skills absent from the map use the ownership-based default: owned -> active,
 * shared -> `defaultActiveOnShare` from the interface config. Toggles that
 * land on the resolved default remove the key from the map rather than
 * persisting a redundant entry, keeping `skillStates` strictly an exceptions
 * list (otherwise rapid round-trip toggles would exhaust the 200-entry cap).
 *
 * React Query is the single source of truth. Toggling drives an optimistic
 * mutation that updates the cache, identical to the favorites pattern.
 * Toggling is blocked until the initial fetch succeeds, preventing an empty
 * baseline (from isLoading or a failed GET) from wiping server-side overrides.
 * Writes are serialized via a module-scoped queue so rapid toggles from any
 * hook instance cannot race: only one request is ever in flight, and the
 * latest desired state is sent when the previous one settles. Each toggle
 * reads the latest optimistic state directly from the React Query cache so
 * rapid successive toggles cannot drop earlier changes via stale closure.
 */
export default function useSkillActiveState() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const queryClient = useQueryClient();
  const configQuery = useGetStartupConfig();
  const getQuery = useGetSkillStatesQuery();
  const updateMutation = useUpdateSkillStatesMutation();

  const userId = user?.id ?? '';

  const defaultActiveOnShare = useMemo(() => {
    const skills = configQuery.data?.interface?.skills;
    if (typeof skills === 'object' && skills !== null && 'defaultActiveOnShare' in skills) {
      return skills.defaultActiveOnShare === true;
    }
    return false;
  }, [configQuery.data]);

  const skillStates = useMemo<TSkillStatesResponse>(
    () => (getQuery.data && typeof getQuery.data === 'object' ? getQuery.data : EMPTY_STATES),
    [getQuery.data],
  );

  const canToggle = !getQuery.isLoading && !getQuery.isError && getQuery.data !== undefined;

  const flush = useCallback(async () => {
    if (!userId) {
      return;
    }
    const queue = getWriteQueue(userId);
    while (queue.pending !== null) {
      const next = queue.pending;
      queue.pending = null;
      queue.inFlight = true;
      try {
        await updateMutation.mutateAsync(next);
      } catch (error) {
        logger.error('Error updating skill states:', error);
        const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
        const messageKey =
          code === 'MAX_SKILL_STATES_EXCEEDED' ? 'com_ui_skill_states_limit' : 'com_ui_error';
        showToast({ message: localize(messageKey), status: 'error' });
        queue.pending = null;
        break;
      }
    }
    queue.inFlight = false;
  }, [userId, updateMutation, showToast, localize]);

  const isActive = useCallback(
    (skill: { _id: string; author: string }): boolean => {
      const override = skillStates[skill._id];
      if (override !== undefined) {
        return override;
      }
      return resolveDefault(skill.author, userId, defaultActiveOnShare);
    },
    [skillStates, userId, defaultActiveOnShare],
  );

  const toggle = useCallback(
    (skill: { _id: string; author: string }) => {
      if (!canToggle || !userId) {
        return;
      }
      const queue = getWriteQueue(userId);
      const cached =
        queryClient.getQueryData<TSkillStatesResponse>([QueryKeys.skillStates]) ?? EMPTY_STATES;
      const baseline = queue.pending ?? cached;
      const defaultValue = resolveDefault(skill.author, userId, defaultActiveOnShare);
      const override = baseline[skill._id];
      const currentActive = override !== undefined ? override : defaultValue;
      const nextValue = !currentActive;
      const next = { ...baseline };
      if (nextValue === defaultValue) {
        delete next[skill._id];
      } else {
        next[skill._id] = nextValue;
      }
      queue.pending = next;
      if (!queue.inFlight) {
        flush();
      }
    },
    [queryClient, userId, defaultActiveOnShare, canToggle, flush],
  );

  return {
    skillStates,
    defaultActiveOnShare,
    isActive,
    toggle,
    isLoading: getQuery.isLoading,
    isError: getQuery.isError,
    isUpdating: updateMutation.isLoading,
  };
}
