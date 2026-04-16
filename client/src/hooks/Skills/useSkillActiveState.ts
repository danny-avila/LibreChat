import { useCallback, useMemo } from 'react';
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
 * shared -> `defaultActiveOnShare` from the interface config.
 *
 * React Query is the single source of truth. Toggling drives an optimistic
 * mutation that updates the cache, identical to the favorites pattern.
 * Toggling is blocked until the initial fetch resolves to prevent overwriting
 * server-side state with an empty snapshot.
 */
export default function useSkillActiveState() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
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

  const save = useCallback(
    async (next: TSkillStatesResponse) => {
      try {
        await updateMutation.mutateAsync(next);
      } catch (error) {
        logger.error('Error updating skill states:', error);
        showToast({ message: localize('com_ui_error'), status: 'error' });
      }
    },
    [updateMutation, showToast, localize],
  );

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
      if (getQuery.isLoading) {
        return;
      }
      const current = isActive(skill);
      save({ ...skillStates, [skill._id]: !current });
    },
    [skillStates, isActive, save, getQuery.isLoading],
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
