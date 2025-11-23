import { atom } from 'recoil';

export type Favorite = {
  agentId?: string;
  model?: string;
  endpoint?: string;
};

export type FavoriteModel = {
  model: string;
  endpoint: string;
};

export type FavoritesState = Favorite[];

const favorites = atom<FavoritesState>({
  key: 'favorites',
  default: [],
});

export default {
  favorites,
};
