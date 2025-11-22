import { useEffect } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';
import type { FavoriteModel } from '~/store/favorites';
import { useGetFavoritesQuery, useUpdateFavoritesMutation } from '~/data-provider';

export default function useFavorites() {
  const [favorites, setFavorites] = useRecoilState(store.favorites);
  const getFavoritesQuery = useGetFavoritesQuery();
  const updateFavoritesMutation = useUpdateFavoritesMutation();

  useEffect(() => {
    if (getFavoritesQuery.data) {
      setFavorites({
        agents: getFavoritesQuery.data.agents || [],
        models: getFavoritesQuery.data.models || [],
      });
    }
  }, [getFavoritesQuery.data, setFavorites]);

  const saveFavorites = (newFavorites: typeof favorites) => {
    setFavorites(newFavorites);
    updateFavoritesMutation.mutate(newFavorites);
  };

  const addFavoriteAgent = (id: string) => {
    const agents = favorites?.agents || [];
    if (agents.includes(id)) return;
    const newFavorites = {
      ...favorites,
      agents: [...agents, id],
    };
    saveFavorites(newFavorites);
  };

  const removeFavoriteAgent = (id: string) => {
    const agents = favorites?.agents || [];
    const newFavorites = {
      ...favorites,
      agents: agents.filter((item) => item !== id),
    };
    saveFavorites(newFavorites);
  };

  const addFavoriteModel = (model: FavoriteModel) => {
    const models = favorites?.models || [];
    if (models.some((m) => m.model === model.model && m.endpoint === model.endpoint)) return;
    const newFavorites = {
      ...favorites,
      models: [...models, model],
    };
    saveFavorites(newFavorites);
  };

  const removeFavoriteModel = (model: string, endpoint: string) => {
    const models = favorites?.models || [];
    const newFavorites = {
      ...favorites,
      models: models.filter((m) => !(m.model === model && m.endpoint === endpoint)),
    };
    saveFavorites(newFavorites);
  };

  const isFavoriteAgent = (id: string) => {
    return (favorites?.agents || []).includes(id);
  };

  const isFavoriteModel = (model: string, endpoint: string) => {
    return (favorites?.models || []).some((m) => m.model === model && m.endpoint === endpoint);
  };

  const toggleFavoriteAgent = (id: string) => {
    if (isFavoriteAgent(id)) {
      removeFavoriteAgent(id);
    } else {
      addFavoriteAgent(id);
    }
  };

  const toggleFavoriteModel = (model: FavoriteModel) => {
    if (isFavoriteModel(model.model, model.endpoint)) {
      removeFavoriteModel(model.model, model.endpoint);
    } else {
      addFavoriteModel(model);
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
  };
}
