import { Removable } from './removable';
import type { CancelOptions, FetchStatus, QueryKey, QueryMeta, QueryOptions, QueryStatus, SetDataOptions } from './types';
import type { QueryCache } from './queryCache';
import type { QueryObserver } from './queryObserver';
import type { Logger } from './logger';
interface QueryConfig<TQueryFnData, TError, TData, TQueryKey extends QueryKey = QueryKey> {
    cache: QueryCache;
    queryKey: TQueryKey;
    queryHash: string;
    logger?: Logger;
    options?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>;
    defaultOptions?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>;
    state?: QueryState<TData, TError>;
}
export interface QueryState<TData = unknown, TError = unknown> {
    data: TData | undefined;
    dataUpdateCount: number;
    dataUpdatedAt: number;
    error: TError | null;
    errorUpdateCount: number;
    errorUpdatedAt: number;
    fetchFailureCount: number;
    fetchFailureReason: TError | null;
    fetchMeta: any;
    isInvalidated: boolean;
    status: QueryStatus;
    fetchStatus: FetchStatus;
}
export interface FetchContext<TQueryFnData, TError, TData, TQueryKey extends QueryKey = QueryKey> {
    fetchFn: () => unknown | Promise<unknown>;
    fetchOptions?: FetchOptions;
    signal?: AbortSignal;
    options: QueryOptions<TQueryFnData, TError, TData, any>;
    queryKey: TQueryKey;
    state: QueryState<TData, TError>;
}
export interface QueryBehavior<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> {
    onFetch: (context: FetchContext<TQueryFnData, TError, TData, TQueryKey>) => void;
}
export interface FetchOptions {
    cancelRefetch?: boolean;
    meta?: any;
}
interface FailedAction<TError> {
    type: 'failed';
    failureCount: number;
    error: TError;
}
interface FetchAction {
    type: 'fetch';
    meta?: any;
}
interface SuccessAction<TData> {
    data: TData | undefined;
    type: 'success';
    dataUpdatedAt?: number;
    manual?: boolean;
}
interface ErrorAction<TError> {
    type: 'error';
    error: TError;
}
interface InvalidateAction {
    type: 'invalidate';
}
interface PauseAction {
    type: 'pause';
}
interface ContinueAction {
    type: 'continue';
}
interface SetStateAction<TData, TError> {
    type: 'setState';
    state: Partial<QueryState<TData, TError>>;
    setStateOptions?: SetStateOptions;
}
export declare type Action<TData, TError> = ContinueAction | ErrorAction<TError> | FailedAction<TError> | FetchAction | InvalidateAction | PauseAction | SetStateAction<TData, TError> | SuccessAction<TData>;
export interface SetStateOptions {
    meta?: any;
}
export declare class Query<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> extends Removable {
    queryKey: TQueryKey;
    queryHash: string;
    options: QueryOptions<TQueryFnData, TError, TData, TQueryKey>;
    initialState: QueryState<TData, TError>;
    revertState?: QueryState<TData, TError>;
    state: QueryState<TData, TError>;
    isFetchingOptimistic?: boolean;
    private cache;
    private logger;
    private promise?;
    private retryer?;
    private observers;
    private defaultOptions?;
    private abortSignalConsumed;
    constructor(config: QueryConfig<TQueryFnData, TError, TData, TQueryKey>);
    get meta(): QueryMeta | undefined;
    private setOptions;
    protected optionalRemove(): void;
    setData(newData: TData, options?: SetDataOptions & {
        manual: boolean;
    }): TData;
    setState(state: Partial<QueryState<TData, TError>>, setStateOptions?: SetStateOptions): void;
    cancel(options?: CancelOptions): Promise<void>;
    destroy(): void;
    reset(): void;
    isActive(): boolean;
    isDisabled(): boolean;
    isStale(): boolean;
    isStaleByTime(staleTime?: number): boolean;
    onFocus(): void;
    onOnline(): void;
    addObserver(observer: QueryObserver<any, any, any, any, any>): void;
    removeObserver(observer: QueryObserver<any, any, any, any, any>): void;
    getObserversCount(): number;
    invalidate(): void;
    fetch(options?: QueryOptions<TQueryFnData, TError, TData, TQueryKey>, fetchOptions?: FetchOptions): Promise<TData>;
    private dispatch;
}
export {};
//# sourceMappingURL=query.d.ts.map