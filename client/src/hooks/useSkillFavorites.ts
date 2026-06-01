import { useCallback, useMemo } from 'react';
import { useToastContext } from '@librechat/client';
import { useGetSkillFavoritesQuery, useUpdateSkillFavoritesMutation } from '~/data-provider';
import { getFavoritesErrorMessage, logger } from '~/utils';
import { useLocalize } from '~/hooks';

/** Maximum number of skills a user can favorite (must match backend MAX_SKILL_FAVORITES). */
const MAX_SKILL_FAVORITES = 50;
const EMPTY_FAVORITES: string[] = [];

/**
 * Hook for managing user skill favorites.
 *
 * Skill favorites are a flat array of skill ObjectId strings, persisted via
 * `/api/user/settings/favorites/skills`. React Query is the single source of
 * truth — toggling drives an optimistic mutation that updates the cache,
 * eliminating the need for a separate atom mirror.
 */
export default function useSkillFavorites() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const getQuery = useGetSkillFavoritesQuery();
  const updateMutation = useUpdateSkillFavoritesMutation();

  const favorites = useMemo(
    () => (Array.isArray(getQuery.data) ? getQuery.data : EMPTY_FAVORITES),
    [getQuery.data],
  );

  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);

  const save = useCallback(
    async (next: string[]) => {
      const deduped = Array.from(new Set(next));
      try {
        await updateMutation.mutateAsync(deduped);
      } catch (error) {
        logger.error('Error updating skill favorites:', error);
        showToast({
          message: getFavoritesErrorMessage(error, localize, MAX_SKILL_FAVORITES),
          status: 'error',
        });
      }
    },
    [updateMutation, showToast, localize],
  );

  const isFavorite = useCallback(
    (skillId: string | undefined | null): boolean => {
      if (!skillId) {
        return false;
      }
      return favoriteSet.has(skillId);
    },
    [favoriteSet],
  );

  const add = useCallback(
    (skillId: string) => {
      if (favoriteSet.has(skillId)) {
        return;
      }
      save([...favorites, skillId]);
    },
    [favorites, favoriteSet, save],
  );

  const remove = useCallback(
    (skillId: string) => {
      save(favorites.filter((id) => id !== skillId));
    },
    [favorites, save],
  );

  const toggle = useCallback(
    (skillId: string) => {
      if (favoriteSet.has(skillId)) {
        remove(skillId);
      } else {
        add(skillId);
      }
    },
    [favoriteSet, add, remove],
  );

  return {
    favorites,
    isFavorite,
    add,
    remove,
    toggle,
    isLoading: getQuery.isLoading,
    isError: getQuery.isError,
    isUpdating: updateMutation.isLoading,
  };
}
