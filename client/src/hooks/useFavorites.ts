import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import type { Favorite } from '~/store/favorites';
import store from '~/store';
import { useGetFavoritesQuery, useUpdateFavoritesMutation } from '~/data-provider';

export default function useFavorites() {
  const [favorites, setFavorites] = useRecoilState(store.favorites);
  const getFavoritesQuery = useGetFavoritesQuery();
  const updateFavoritesMutation = useUpdateFavoritesMutation();

  useEffect(() => {
    if (getFavoritesQuery.data) {
      if (Array.isArray(getFavoritesQuery.data)) {
        const mapped = getFavoritesQuery.data.map(
          (f: Favorite & { type?: string; id?: string }) => {
            if (f.agentId || (f.model && f.endpoint)) return f;
            if (f.type === 'agent' && f.id) return { agentId: f.id };
            // Drop label and map legacy model format
            if (f.type === 'model') return { model: f.model, endpoint: f.endpoint };
            return f;
          },
        );
        setFavorites(mapped);
      } else {
        // Handle legacy format or invalid data
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

  const isFavoriteAgent = (agentId: string) => {
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

  const reorderFavorites = (newFavorites: typeof favorites) => {
    setFavorites(newFavorites);
  };

  const persistFavorites = (newFavorites: typeof favorites) => {
    updateFavoritesMutation.mutate(newFavorites);
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
    persistFavorites,
  };
}
