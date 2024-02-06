import type { DefaultedQueryObserverOptions } from '@tanstack/query-core';
import type { QueryObserver } from '@tanstack/query-core';
import type { QueryErrorResetBoundaryValue } from './QueryErrorResetBoundary';
import type { QueryObserverResult } from '@tanstack/query-core';
import type { QueryKey } from '@tanstack/query-core';
export declare const ensureStaleTime: (defaultedOptions: DefaultedQueryObserverOptions<any, any, any, any, any>) => void;
export declare const willFetch: (result: QueryObserverResult<any, any>, isRestoring: boolean) => boolean;
export declare const shouldSuspend: (defaultedOptions: DefaultedQueryObserverOptions<any, any, any, any, any> | undefined, result: QueryObserverResult<any, any>, isRestoring: boolean) => boolean | undefined;
export declare const fetchOptimistic: <TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(defaultedOptions: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, observer: QueryObserver<TQueryFnData, TError, TData, TQueryData, TQueryKey>, errorResetBoundary: QueryErrorResetBoundaryValue) => Promise<void>;
//# sourceMappingURL=suspense.d.ts.map