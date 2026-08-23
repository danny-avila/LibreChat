import { dataService, QueryKeys } from 'librechat-data-provider';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseQueryOptions } from '@tanstack/react-query';
import type { TToolFavorite } from 'librechat-data-provider';
import type { FavoritesState } from '~/store/favorites';
import { getSessionUserId } from '~/utils/session';
import { enqueue } from '~/utils';

const PINNED_ORDER_QUEUE = 'pinnedOrder';

/**
 * Whether a write started by `owner` still belongs to the account that is
 * signed in, which decides both whether it may be sent and whether it may touch
 * the shared pinned-order cache, since that key is not scoped by user.
 *
 * The identity comes from the auth provider rather than from this hook, which
 * lives in a section the sidebar unmounts during a search. A signed-out session
 * reads as `undefined` and so is foreign to any owner: work queued by an
 * account that has since left must not ride out on the next one's credentials.
 */
const isForeignSession = (owner?: string): boolean => getSessionUserId() !== owner;

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

/** The account each order was initiated by.
 *
 *  `onMutate` runs before the mutation function and awaits `cancelQueries`, so
 *  the credentials can turn over in between. Reading the session again in the
 *  mutation function would attribute the write to whoever is signed in by then
 *  and send the previous account's order as them, so the owner is recorded in
 *  `onMutate`'s first synchronous statement and carried on the order itself. */
const ownerByOrder = new WeakMap<string[], string | undefined>();

export const useUpdatePinnedOrderMutation = () => {
  const queryClient = useQueryClient();
  return useMutation(
    /* Two drags completed inside one round trip would otherwise race, and the
     * server would keep whichever request happened to land last rather than the
     * order the user finished on. */
    (pinnedOrder: string[]) => {
      const owner = ownerByOrder.get(pinnedOrder);
      return enqueue(`${PINNED_ORDER_QUEUE}:${owner ?? ''}`, async () => {
        /* A queued write runs later and carries whatever Authorization header
         * is current by then. If the session changed while it waited, sending
         * it would write one account's order into another's document. */
        if (isForeignSession(owner)) {
          throw new Error('pinnedOrder write abandoned: the signed-in user changed');
        }
        try {
          return await dataService.updatePinnedOrder(pinnedOrder);
        } catch (error) {
          /* Corrected here rather than in `onError` because the section that
           * owns this hook is unmounted while a search is active, and the
           * observer callbacks do not run once it is. The cache holds an order
           * the server never accepted, and this query refetches on nothing, so
           * leaving it would pass it off as stored for the rest of the session.
           * Restoring a captured previous value is not safe either: queued
           * behind another write it may itself be unpersisted, and before the
           * first fetch resolves there is none. */
          if (latestPinnedOrder === pinnedOrder && !isForeignSession(owner)) {
            queryClient.resetQueries([QueryKeys.pinnedOrder]);
          }
          throw error;
        }
      });
    },
    {
      onMutate: async (newOrder) => {
        /* First, before the await below can let the session change. */
        const owner = getSessionUserId();
        ownerByOrder.set(newOrder, owner);
        latestPinnedOrder = newOrder;
        await queryClient.cancelQueries([QueryKeys.pinnedOrder]);
        if (isForeignSession(owner)) {
          /* The session turned over while that await was outstanding. This
           * cache is shared, so showing one account's order to the next is the
           * same mistake as sending it. */
          return { owner };
        }
        queryClient.setQueryData([QueryKeys.pinnedOrder], newOrder);
        return { owner };
      },
      onSuccess: (savedOrder, newOrder, context) => {
        if (isForeignSession(context?.owner)) {
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
