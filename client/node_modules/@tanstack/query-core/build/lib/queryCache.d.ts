import { Query } from './query';
import { Subscribable } from './subscribable';
import type { QueryFilters } from './utils';
import type { Action, QueryState } from './query';
import type { NotifyEvent, QueryKey, QueryOptions } from './types';
import type { QueryClient } from './queryClient';
import type { QueryObserver } from './queryObserver';
interface QueryCacheConfig {
    onError?: (error: unknown, query: Query<unknown, unknown, unknown>) => void;
    onSuccess?: (data: unknown, query: Query<unknown, unknown, unknown>) => void;
    onSettled?: (data: unknown | undefined, error: unknown | null, query: Query<unknown, unknown, unknown>) => void;
}
interface NotifyEventQueryAdded extends NotifyEvent {
    type: 'added';
    query: Query<any, any, any, any>;
}
interface NotifyEventQueryRemoved extends NotifyEvent {
    type: 'removed';
    query: Query<any, any, any, any>;
}
interface NotifyEventQueryUpdated extends NotifyEvent {
    type: 'updated';
    query: Query<any, any, any, any>;
    action: Action<any, any>;
}
interface NotifyEventQueryObserverAdded extends NotifyEvent {
    type: 'observerAdded';
    query: Query<any, any, any, any>;
    observer: QueryObserver<any, any, any, any, any>;
}
interface NotifyEventQueryObserverRemoved extends NotifyEvent {
    type: 'observerRemoved';
    query: Query<any, any, any, any>;
    observer: QueryObserver<any, any, any, any, any>;
}
interface NotifyEventQueryObserverResultsUpdated extends NotifyEvent {
    type: 'observerResultsUpdated';
    query: Query<any, any, any, any>;
}
interface NotifyEventQueryObserverOptionsUpdated extends NotifyEvent {
    type: 'observerOptionsUpdated';
    query: Query<any, any, any, any>;
    observer: QueryObserver<any, any, any, any, any>;
}
export declare type QueryCacheNotifyEvent = NotifyEventQueryAdded | NotifyEventQueryRemoved | NotifyEventQueryUpdated | NotifyEventQueryObserverAdded | NotifyEventQueryObserverRemoved | NotifyEventQueryObserverResultsUpdated | NotifyEventQueryObserverOptionsUpdated;
declare type QueryCacheListener = (event: QueryCacheNotifyEvent) => void;
export declare class QueryCache extends Subscribable<QueryCacheListener> {
    config: QueryCacheConfig;
    private queries;
    private queriesMap;
    constructor(config?: QueryCacheConfig);
    build<TQueryFnData, TError, TData, TQueryKey extends QueryKey>(client: QueryClient, options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>, state?: QueryState<TData, TError>): Query<TQueryFnData, TError, TData, TQueryKey>;
    add(query: Query<any, any, any, any>): void;
    remove(query: Query<any, any, any, any>): void;
    clear(): void;
    get<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(queryHash: string): Query<TQueryFnData, TError, TData, TQueryKey> | undefined;
    getAll(): Query[];
    find<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData>(arg1: QueryKey, arg2?: QueryFilters): Query<TQueryFnData, TError, TData> | undefined;
    findAll(queryKey?: QueryKey, filters?: QueryFilters): Query[];
    findAll(filters?: QueryFilters): Query[];
    findAll(arg1?: QueryKey | QueryFilters, arg2?: QueryFilters): Query[];
    notify(event: QueryCacheNotifyEvent): void;
    onFocus(): void;
    onOnline(): void;
}
export {};
//# sourceMappingURL=queryCache.d.ts.map