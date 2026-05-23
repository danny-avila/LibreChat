import { dataService, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { FavoritesState } from '~/store/favorites';

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

export const useGetSkillFavoritesQuery = (
  config?: Omit<UseQueryOptions<string[], Error>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery<string[], Error>(
    [QueryKeys.skillFavorites],
    () => dataService.getSkillFavorites() as Promise<string[]>,
    {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
    },
  );
};

export const useUpdateSkillFavoritesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    (skillFavorites: string[]) =>
      dataService.updateSkillFavorites(skillFavorites) as Promise<string[]>,
    {
      onMutate: async (newFavorites) => {
        await queryClient.cancelQueries([QueryKeys.skillFavorites]);
        const previous = queryClient.getQueryData<string[]>([QueryKeys.skillFavorites]);
        queryClient.setQueryData([QueryKeys.skillFavorites], newFavorites);
        return { previous };
      },
      onError: (_err, _newFavorites, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData([QueryKeys.skillFavorites], context.previous);
        }
      },
    },
  );
};
