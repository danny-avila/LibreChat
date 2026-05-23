import type { TUserFavorite } from 'librechat-data-provider';
import { createTabIsolatedAtom } from './jotai-utils';

export type Favorite = TUserFavorite;

export type FavoriteModel = {
  model: string;
  endpoint: string;
};

export type FavoritesState = Favorite[];

/**
 * This atom stores the user's favorite models/agents
 */
export const favoritesAtom = createTabIsolatedAtom<FavoritesState>('favorites', []);
