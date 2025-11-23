import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService } from 'librechat-data-provider';
import type { FavoritesState } from '~/store/favorites';

export const useGetFavoritesQuery = (config?: any) => {
  return useQuery<FavoritesState>(
    ['favorites'],
    () => dataService.getFavorites() as Promise<FavoritesState>,
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUpdateFavoritesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (favorites: FavoritesState) =>
      dataService.updateFavorites(favorites) as Promise<FavoritesState>,
    {
      onSuccess: (data) => {
        queryClient.setQueryData(['favorites'], data);
      },
    },
  );
};
