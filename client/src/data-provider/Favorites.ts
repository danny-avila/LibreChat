import { dataService } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { FavoritesState } from '~/store/favorites';

export const useGetFavoritesQuery = (
  config?: Omit<UseQueryOptions<FavoritesState, Error>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery<FavoritesState, Error>(
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
      // Optimistic update to prevent UI flickering when toggling favorites
      // Sets query cache immediately before the request completes
      onMutate: async (newFavorites) => {
        await queryClient.cancelQueries(['favorites']);

        const previousFavorites = queryClient.getQueryData<FavoritesState>(['favorites']);
        queryClient.setQueryData(['favorites'], newFavorites);

        return { previousFavorites };
      },
      onError: (_err, _newFavorites, context) => {
        if (context?.previousFavorites) {
          queryClient.setQueryData(['favorites'], context.previousFavorites);
        }
      },
    },
  );
};
