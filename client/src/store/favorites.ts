import { createStorageAtom } from './jotai-utils';

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

/**
 * This atom stores the user's favorite models/agents
 */
export const favoritesAtom = createStorageAtom<FavoritesState>('favorites', []);
