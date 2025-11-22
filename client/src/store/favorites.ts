import { atom } from 'recoil';

export type FavoriteModel = {
  model: string;
  endpoint: string;
  label?: string;
};

export type FavoritesState = {
  agents: string[];
  models: FavoriteModel[];
};

const favorites = atom<FavoritesState>({
  key: 'favorites',
  default: {
    agents: [],
    models: [],
  },
});

export default {
  favorites,
};
