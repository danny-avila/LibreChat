import type { DefaultedQueryObserverOptions, Query, QueryKey, QueryObserverResult, UseErrorBoundary } from '@tanstack/query-core';
import type { QueryErrorResetBoundaryValue } from './QueryErrorResetBoundary';
export declare const ensurePreventErrorBoundaryRetry: <TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(options: DefaultedQueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, errorResetBoundary: QueryErrorResetBoundaryValue) => void;
export declare const useClearResetErrorBoundary: (errorResetBoundary: QueryErrorResetBoundaryValue) => void;
export declare const getHasError: <TData, TError, TQueryFnData, TQueryData, TQueryKey extends QueryKey>({ result, errorResetBoundary, useErrorBoundary, query, }: {
    result: QueryObserverResult<TData, TError>;
    errorResetBoundary: QueryErrorResetBoundaryValue;
    useErrorBoundary: UseErrorBoundary<TQueryFnData, TError, TQueryData, TQueryKey>;
    query: Query<TQueryFnData, TError, TQueryData, TQueryKey>;
}) => boolean;
//# sourceMappingURL=errorBoundaryUtils.d.ts.map