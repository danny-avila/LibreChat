import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';
import { useGetFavoritesQuery, useUpdateFavoritesMutation } from '~/data-provider';

/**
 * Hook for managing user favorites (pinned agents and models).
 *
 * Favorites are synchronized with the server via `/api/user/settings/favorites`.
 * Each favorite is either:
 * - An agent: `{ agentId: string }`
 * - A model: `{ model: string, endpoint: string }`
 *
 * @returns Object containing favorites state and helper methods for
 * adding, removing, toggling, reordering, and checking favorites.
 */
export default function useFavorites() {
  const [favorites, setFavorites] = useRecoilState(store.favorites);
  const getFavoritesQuery = useGetFavoritesQuery();
  const updateFavoritesMutation = useUpdateFavoritesMutation();

  useEffect(() => {
    if (getFavoritesQuery.data) {
      if (Array.isArray(getFavoritesQuery.data)) {
        setFavorites(getFavoritesQuery.data);
      } else {
        setFavorites([]);
      }
    }
  }, [getFavoritesQuery.data, setFavorites]);

  const saveFavorites = (newFavorites: typeof favorites) => {
    const cleaned = newFavorites.map((f) => {
      if (f.agentId) return { agentId: f.agentId };
      if (f.model && f.endpoint) return { model: f.model, endpoint: f.endpoint };
      return f;
    });
    setFavorites(cleaned);
    updateFavoritesMutation.mutate(cleaned);
  };

  const addFavoriteAgent = (agentId: string) => {
    if (favorites.some((f) => f.agentId === agentId)) return;
    const newFavorites = [...favorites, { agentId }];
    saveFavorites(newFavorites);
  };

  const removeFavoriteAgent = (agentId: string) => {
    const newFavorites = favorites.filter((f) => f.agentId !== agentId);
    saveFavorites(newFavorites);
  };

  const addFavoriteModel = (model: { model: string; endpoint: string }) => {
    if (favorites.some((f) => f.model === model.model && f.endpoint === model.endpoint)) return;
    const newFavorites = [...favorites, { model: model.model, endpoint: model.endpoint }];
    saveFavorites(newFavorites);
  };

  const removeFavoriteModel = (model: string, endpoint: string) => {
    const newFavorites = favorites.filter((f) => !(f.model === model && f.endpoint === endpoint));
    saveFavorites(newFavorites);
  };

  const isFavoriteAgent = (agentId: string | undefined | null) => {
    if (!agentId) {
      return false;
    }
    return favorites.some((f) => f.agentId === agentId);
  };

  const isFavoriteModel = (model: string, endpoint: string) => {
    return favorites.some((f) => f.model === model && f.endpoint === endpoint);
  };

  const toggleFavoriteAgent = (agentId: string) => {
    if (isFavoriteAgent(agentId)) {
      removeFavoriteAgent(agentId);
    } else {
      addFavoriteAgent(agentId);
    }
  };

  const toggleFavoriteModel = (model: { model: string; endpoint: string }) => {
    if (isFavoriteModel(model.model, model.endpoint)) {
      removeFavoriteModel(model.model, model.endpoint);
    } else {
      addFavoriteModel(model);
    }
  };

  /**
   * Reorder favorites and persist the new order to the server.
   * This combines state update and persistence to avoid race conditions
   * where the closure captures stale state.
   */
  const reorderFavorites = (newFavorites: typeof favorites, persist = false) => {
    const cleaned = newFavorites.map((f) => {
      if (f.agentId) {
        return { agentId: f.agentId };
      }
      if (f.model && f.endpoint) {
        return { model: f.model, endpoint: f.endpoint };
      }
      return f;
    });
    setFavorites(cleaned);
    if (persist) {
      updateFavoritesMutation.mutate(cleaned);
    }
  };

  return {
    favorites,
    addFavoriteAgent,
    removeFavoriteAgent,
    addFavoriteModel,
    removeFavoriteModel,
    isFavoriteAgent,
    isFavoriteModel,
    toggleFavoriteAgent,
    toggleFavoriteModel,
    reorderFavorites,
    /** Whether the favorites query is currently loading */
    isLoading: getFavoritesQuery.isLoading,
    /** Whether there was an error fetching favorites */
    isError: getFavoritesQuery.isError,
    /** Whether the update mutation is in progress */
    isUpdating: updateFavoritesMutation.isLoading,
    /** Error from fetching favorites, if any */
    fetchError: getFavoritesQuery.error,
    /** Error from updating favorites, if any */
    updateError: updateFavoritesMutation.error,
  };
}
