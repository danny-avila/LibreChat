import { useQuery as useQueryV4, useMutation as useMutationV4 } from '@tanstack/react-query';
import type {
  QueryKey,
  UseQueryResult,
  UseQueryOptions,
  UseMutationResult,
  UseMutationOptions,
} from '@tanstack/react-query';

/**
 * The admin panel was written against TanStack Query 5; SassyChat runs 4. This module gives the
 * panel the few version-5 spellings it uses, on top of version 4, so its screens stay as written:
 * `queryOptions`, `placeholderData: keepPreviousData`, and `isPending` on queries and mutations.
 */
export { QueryClient, useQueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Version 5's typed identity helper for a query's options. */
export function queryOptions<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    queryKey: TQueryKey;
    placeholderData?: unknown;
  },
): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & { queryKey: TQueryKey } {
  return options as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> & {
    queryKey: TQueryKey;
  };
}

/** Version 5's marker for "keep showing the previous data while the next loads". */
export function keepPreviousData<T>(previous: T | undefined): T | undefined {
  return previous;
}

type CompatQueryOptions<TQueryFnData, TError, TData, TQueryKey extends QueryKey> = Omit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'placeholderData'
> & { placeholderData?: unknown };

/** Omits a key from each member of a union, so the result stays a discriminated union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export type CompatQueryResult<TData, TError> = DistributiveOmit<
  UseQueryResult<TData, TError>,
  'status'
> & {
  /** Version 5: no data yet (version 4 calls it `isLoading`). */
  isPending: boolean;
  /** Version 5's names: `pending` is version 4's `loading`. */
  status: 'pending' | 'error' | 'success';
};

export function useQuery<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
>(
  options: CompatQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
): CompatQueryResult<TData, TError> {
  const { placeholderData, ...rest } = options;
  const keepPrevious = placeholderData === keepPreviousData;
  const v4Options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey> = {
    ...(rest as UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>),
  };
  if (keepPrevious) {
    v4Options.keepPreviousData = true;
  } else if (placeholderData !== undefined) {
    v4Options.placeholderData = placeholderData as UseQueryOptions<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >['placeholderData'];
  }
  const result = useQueryV4<TQueryFnData, TError, TData, TQueryKey>(v4Options);
  /* A copy: version 4 tracks which fields a component reads through getter-only properties. */
  return {
    ...result,
    isPending: result.isLoading,
    status: result.status === 'loading' ? 'pending' : result.status,
  } as CompatQueryResult<TData, TError>;
}

export type CompatMutationResult<TData, TError, TVariables, TContext> = UseMutationResult<
  TData,
  TError,
  TVariables,
  TContext
> & {
  /** Version 5: the mutation is running (version 4 calls it `isLoading`). */
  isPending: boolean;
};

export function useMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
): CompatMutationResult<TData, TError, TVariables, TContext> {
  const result = useMutationV4(options);
  return { ...result, isPending: result.isLoading };
}
