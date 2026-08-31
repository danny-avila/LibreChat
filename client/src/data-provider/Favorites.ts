import { dataService, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { TToolFavorite } from 'librechat-data-provider';
import type { FavoritesState } from '~/store/favorites';

const sameFavorite = (a: TToolFavorite, b: TToolFavorite) =>
  a.itemType === b.itemType && a.itemId === b.itemId;

export const useGetFavoritesQuery = (
  config?: Omit<UseQueryOptions<FavoritesState, Error>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery<FavoritesState, Error>(
    [QueryKeys.favorites],
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
      onMutate: async (newFavorites) => {
        await queryClient.cancelQueries([QueryKeys.favorites]);
        const previousFavorites = queryClient.getQueryData<FavoritesState>([QueryKeys.favorites]);
        queryClient.setQueryData([QueryKeys.favorites], newFavorites);
        return { previousFavorites };
      },
      onError: (_err, _newFavorites, context) => {
        if (context?.previousFavorites) {
          queryClient.setQueryData([QueryKeys.favorites], context.previousFavorites);
        }
      },
    },
  );
};

export const useGetToolFavoritesQuery = (
  config?: Omit<UseQueryOptions<TToolFavorite[], Error>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery<TToolFavorite[], Error>(
    [QueryKeys.toolFavorites],
    () => dataService.getToolFavorites(),
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useAddToolFavoriteMutation = () => {
  const queryClient = useQueryClient();
  return useMutation((favorite: TToolFavorite) => dataService.addToolFavorite(favorite), {
    /** Optimistic writes only apply over known server data. Before the list
     * query has populated, seeding the cache from `[]` would make the toggled
     * item look like the user's only favorite (and `cancelQueries` kills the
     * initial fetch that would correct it) — so skip the write and let
     * `onSettled` refetch the authoritative list instead. */
    onMutate: async (favorite) => {
      await queryClient.cancelQueries([QueryKeys.toolFavorites]);
      const previous = queryClient.getQueryData<TToolFavorite[]>([QueryKeys.toolFavorites]);
      if (previous !== undefined) {
        queryClient.setQueryData<TToolFavorite[]>(
          [QueryKeys.toolFavorites],
          previous.some((f) => sameFavorite(f, favorite)) ? previous : [...previous, favorite],
        );
      }
      return { previous };
    },
    onError: (_err, _favorite, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData([QueryKeys.toolFavorites], context.previous);
      }
    },
    onSettled: (_data, _err, _favorite, context) => {
      if (context?.previous === undefined) {
        queryClient.invalidateQueries([QueryKeys.toolFavorites]);
      }
    },
  });
};

export const useRemoveToolFavoriteMutation = () => {
  const queryClient = useQueryClient();
  return useMutation((favorite: TToolFavorite) => dataService.removeToolFavorite(favorite), {
    onMutate: async (favorite) => {
      await queryClient.cancelQueries([QueryKeys.toolFavorites]);
      const previous = queryClient.getQueryData<TToolFavorite[]>([QueryKeys.toolFavorites]);
      if (previous !== undefined) {
        queryClient.setQueryData<TToolFavorite[]>(
          [QueryKeys.toolFavorites],
          previous.filter((f) => !sameFavorite(f, favorite)),
        );
      }
      return { previous };
    },
    onError: (_err, _favorite, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData([QueryKeys.toolFavorites], context.previous);
      }
    },
    onSettled: (_data, _err, _favorite, context) => {
      if (context?.previous === undefined) {
        queryClient.invalidateQueries([QueryKeys.toolFavorites]);
      }
    },
  });
};
