import { useMemo, useCallback } from 'react';
import type { TToolFavorite, TToolFavoriteType } from 'librechat-data-provider';
import {
  useGetToolFavoritesQuery,
  useAddToolFavoriteMutation,
  useRemoveToolFavoriteMutation,
} from '~/data-provider';

export interface ToolFavorites {
  /** `${itemType}:${itemId}` keys, for O(1) membership tests while building
   *  the palette instead of scanning the favourites array per row. */
  keys: Set<string>;
  isFavorite: (itemType: TToolFavoriteType, itemId: string) => boolean;
  toggleFavorite: (itemType: TToolFavoriteType, itemId: string) => void;
}

export const favoriteKey = (itemType: TToolFavoriteType, itemId: string) => `${itemType}:${itemId}`;

/**
 * Server-persisted favourites for anything the composer palette can list —
 * built-in tools, plugin tools, MCP servers and skills. Backed by the same
 * `{ user, itemType, itemId }` records the tools marketplace writes, so a
 * favourite starred here is already starred there.
 */
export default function useToolFavorites(): ToolFavorites {
  const { data: favorites } = useGetToolFavoritesQuery();
  const addFavorite = useAddToolFavoriteMutation();
  const removeFavorite = useRemoveToolFavoriteMutation();

  const keys = useMemo(() => {
    const set = new Set<string>();
    for (const favorite of favorites ?? []) {
      set.add(favoriteKey(favorite.itemType, favorite.itemId));
    }
    return set;
  }, [favorites]);

  const isFavorite = useCallback(
    (itemType: TToolFavoriteType, itemId: string) => keys.has(favoriteKey(itemType, itemId)),
    [keys],
  );

  const toggleFavorite = useCallback(
    (itemType: TToolFavoriteType, itemId: string) => {
      const favorite: TToolFavorite = { itemType, itemId };
      if (keys.has(favoriteKey(itemType, itemId))) {
        removeFavorite.mutate(favorite);
        return;
      }
      addFavorite.mutate(favorite);
    },
    [keys, addFavorite, removeFavorite],
  );

  return { keys, isFavorite, toggleFavorite };
}
