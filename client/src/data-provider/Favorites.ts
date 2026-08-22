import { useRecoilValue } from 'recoil';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient, UseQueryOptions } from '@tanstack/react-query';
import type { TToolFavorite } from 'librechat-data-provider';
import type { FavoritesState } from '~/store/favorites';
import { enqueue } from '~/utils';
import store from '~/store';

const PINNED_ORDER_QUEUE = 'pinnedOrder';

/** The signed-in account, tracked at module scope so a queued write can still
 *  check it after its component has unmounted. AuthContext is the authoritative
 *  source: right after login it already holds the user while `[QueryKeys.user]`
 *  is still fetching, and an ownership check that read undefined there would
 *  mis-attribute writes made in that window. */
let signedInUserId: string | undefined;

const currentUserId = (queryClient: QueryClient): string | undefined =>
  signedInUserId ?? queryClient.getQueryData<{ id?: string }>([QueryKeys.user])?.id;

/** Whether the account that started a write is still the one signed in. The
 *  pinned-order cache key is not scoped by user, so a response arriving after a
 *  session change would otherwise publish one account's order to the next, and
 *  this query has every automatic refetch trigger disabled to correct it. */
const ownsCache = (queryClient: QueryClient, context?: { owner?: string }): boolean =>
  context?.owner != null && context.owner === currentUserId(queryClient);

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

export const useGetPinnedOrderQuery = (
  config?: Omit<UseQueryOptions<string[], Error>, 'queryKey' | 'queryFn'>,
) => {
  return useQuery<string[], Error>([QueryKeys.pinnedOrder], () => dataService.getPinnedOrder(), {
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: false,
    ...config,
  });
};

/** The order the user last asked for. Module scope for the same reason the
 *  queue is: the sidebar unmounts whole sections while a search is active, and
 *  a per-instance ref would let a remounted hook forget that an older write is
 *  still in flight. */
let latestPinnedOrder: string[] | null = null;

export const useUpdatePinnedOrderMutation = () => {
  const queryClient = useQueryClient();
  /* The same atom `AuthContext` populates from the login response, which is set
   * before the user query resolves, so ownership is known from the first
   * authenticated render rather than only once that fetch lands. */
  const user = useRecoilValue(store.user);
  signedInUserId = user?.id;

  return useMutation(
    /* Two drags completed inside one round trip would otherwise race, and the
     * server would keep whichever request happened to land last rather than the
     * order the user finished on. */
    (pinnedOrder: string[]) => {
      const owner = currentUserId(queryClient);
      return enqueue(`${PINNED_ORDER_QUEUE}:${owner ?? ''}`, () => {
        /* A queued write runs later and carries whatever Authorization header
         * is current by then. If the session changed while it waited, sending
         * it would write one account's order into another's document. */
        if (currentUserId(queryClient) !== owner) {
          throw new Error('pinnedOrder write abandoned: the signed-in user changed');
        }
        return dataService.updatePinnedOrder(pinnedOrder);
      });
    },
    {
      onMutate: async (newOrder) => {
        const owner = currentUserId(queryClient);
        latestPinnedOrder = newOrder;
        await queryClient.cancelQueries([QueryKeys.pinnedOrder]);
        queryClient.setQueryData([QueryKeys.pinnedOrder], newOrder);
        return { owner };
      },
      onError: (_err, newOrder, context) => {
        if (!ownsCache(queryClient, context)) {
          return;
        }
        if (latestPinnedOrder !== newOrder) {
          return;
        }
        /* The newest write failed, so the cache holds an order the server never
         * accepted. Restoring a captured previous value is not safe here: with
         * writes queued behind each other it may itself be unpersisted, and
         * before the first fetch resolves there is no previous value at all.
         * Refetching is the only answer that is right in every case. */
        queryClient.resetQueries([QueryKeys.pinnedOrder]);
      },
      onSuccess: (savedOrder, newOrder, context) => {
        if (!ownsCache(queryClient, context)) {
          return;
        }
        if (latestPinnedOrder !== newOrder) {
          return;
        }
        queryClient.setQueryData([QueryKeys.pinnedOrder], savedOrder);
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
