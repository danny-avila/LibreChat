import { Subscribable } from './subscribable';
import type { QueryKey, QueryObserverOptions, QueryObserverResult, RefetchOptions } from './types';
import type { Action, FetchOptions, Query } from './query';
import type { QueryClient } from './queryClient';
import type { DefaultedQueryObserverOptions, RefetchPageFilters } from './types';
declare type QueryObserverListener<TData, TError> = (result: QueryObserverResult<TData, TError>) => void;
export interface NotifyOptions {
    cache?: boolean;
    listeners?: boolean;
    onError?: boolean;
    onSuccess?: boolean;
}
export interface ObserverFetchOptions extends FetchOptions {
    throwOnError?: boolean;
}
export declare class QueryObserver<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> extends Subscribable<QueryObserverListener<TData, TError>> {
    options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>;
    private client;
    private currentQuery;
    private currentQueryInitialState;
    private currentResult;
    private currentResultState?;
    private currentResultOptions?;
    private previousQueryResult?;
    private selectError;
    private selectFn?;
    private selectResult?;
    private staleTimeoutId?;
    private refetchIntervalId?;
    private currentRefetchInterval?;
    private trackedProps;
    constructor(client: QueryClient, options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>);
    protected bindMethods(): void;
    protected onSubscribe(): void;
    protected onUnsubscribe(): void;
    shouldFetchOnReconnect(): boolean;
    shouldFetchOnWindowFocus(): boolean;
    destroy(): void;
    setOptions(options?: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, notifyOptions?: NotifyOptions): void;
    getOptimisticResult(options: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>): QueryObserverResult<TData, TError>;
    getCurrentResult(): QueryObserverResult<TData, TError>;
    trackResult(result: QueryObserverResult<TData, TError>): QueryObserverResult<TData, TError>;
    getCurrentQuery(): Query<TQueryFnData, TError, TQueryData, TQueryKey>;
    remove(): void;
    refetch<TPageData>({ refetchPage, ...options }?: RefetchOptions & RefetchPageFilters<TPageData>): Promise<QueryObserverResult<TData, TError>>;
    fetchOptimistic(options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>): Promise<QueryObserverResult<TData, TError>>;
    protected fetch(fetchOptions: ObserverFetchOptions): Promise<QueryObserverResult<TData, TError>>;
    private executeFetch;
    private updateStaleTimeout;
    private computeRefetchInterval;
    private updateRefetchInterval;
    private updateTimers;
    private clearStaleTimeout;
    private clearRefetchInterval;
    protected createResult(query: Query<TQueryFnData, TError, TQueryData, TQueryKey>, options: QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>): QueryObserverResult<TData, TError>;
    updateResult(notifyOptions?: NotifyOptions): void;
    private updateQuery;
    onQueryUpdate(action: Action<TData, TError>): void;
    private notify;
}
export {};
//# sourceMappingURL=queryObserver.d.ts.map