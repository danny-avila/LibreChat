import { QueryObserver } from './queryObserver';
import type { DefaultedInfiniteQueryObserverOptions, FetchNextPageOptions, FetchPreviousPageOptions, InfiniteData, InfiniteQueryObserverOptions, InfiniteQueryObserverResult, QueryKey } from './types';
import type { QueryClient } from './queryClient';
import type { NotifyOptions, ObserverFetchOptions } from './queryObserver';
import type { Query } from './query';
declare type InfiniteQueryObserverListener<TData, TError> = (result: InfiniteQueryObserverResult<TData, TError>) => void;
export declare class InfiniteQueryObserver<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> extends QueryObserver<TQueryFnData, TError, InfiniteData<TData>, InfiniteData<TQueryData>, TQueryKey> {
    subscribe: (listener?: InfiniteQueryObserverListener<TData, TError>) => () => void;
    getCurrentResult: () => InfiniteQueryObserverResult<TData, TError>;
    protected fetch: (fetchOptions: ObserverFetchOptions) => Promise<InfiniteQueryObserverResult<TData, TError>>;
    constructor(client: QueryClient, options: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>);
    protected bindMethods(): void;
    setOptions(options?: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, notifyOptions?: NotifyOptions): void;
    getOptimisticResult(options: DefaultedInfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>): InfiniteQueryObserverResult<TData, TError>;
    fetchNextPage({ pageParam, ...options }?: FetchNextPageOptions): Promise<InfiniteQueryObserverResult<TData, TError>>;
    fetchPreviousPage({ pageParam, ...options }?: FetchPreviousPageOptions): Promise<InfiniteQueryObserverResult<TData, TError>>;
    protected createResult(query: Query<TQueryFnData, TError, InfiniteData<TQueryData>, TQueryKey>, options: InfiniteQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>): InfiniteQueryObserverResult<TData, TError>;
}
export {};
//# sourceMappingURL=infiniteQueryObserver.d.ts.map