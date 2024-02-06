import type { QueryFunction, QueryKey } from '@tanstack/query-core';
import type { UseQueryOptions, UseQueryResult } from './types';
declare type UseQueryOptionsForUseQueries<TQueryFnData = unknown, TError = unknown, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'context'>;
declare type MAXIMUM_DEPTH = 20;
declare type GetOptions<T> = T extends {
    queryFnData: infer TQueryFnData;
    error?: infer TError;
    data: infer TData;
} ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData> : T extends {
    queryFnData: infer TQueryFnData;
    error?: infer TError;
} ? UseQueryOptionsForUseQueries<TQueryFnData, TError> : T extends {
    data: infer TData;
    error?: infer TError;
} ? UseQueryOptionsForUseQueries<unknown, TError, TData> : T extends [infer TQueryFnData, infer TError, infer TData] ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData> : T extends [infer TQueryFnData, infer TError] ? UseQueryOptionsForUseQueries<TQueryFnData, TError> : T extends [infer TQueryFnData] ? UseQueryOptionsForUseQueries<TQueryFnData> : T extends {
    queryFn?: QueryFunction<infer TQueryFnData, infer TQueryKey>;
    select: (data: any) => infer TData;
} ? UseQueryOptionsForUseQueries<TQueryFnData, unknown, TData, TQueryKey> : T extends {
    queryFn?: QueryFunction<infer TQueryFnData, infer TQueryKey>;
} ? UseQueryOptionsForUseQueries<TQueryFnData, unknown, TQueryFnData, TQueryKey> : UseQueryOptionsForUseQueries;
declare type GetResults<T> = T extends {
    queryFnData: any;
    error?: infer TError;
    data: infer TData;
} ? UseQueryResult<TData, TError> : T extends {
    queryFnData: infer TQueryFnData;
    error?: infer TError;
} ? UseQueryResult<TQueryFnData, TError> : T extends {
    data: infer TData;
    error?: infer TError;
} ? UseQueryResult<TData, TError> : T extends [any, infer TError, infer TData] ? UseQueryResult<TData, TError> : T extends [infer TQueryFnData, infer TError] ? UseQueryResult<TQueryFnData, TError> : T extends [infer TQueryFnData] ? UseQueryResult<TQueryFnData> : T extends {
    queryFn?: QueryFunction<unknown, any>;
    select: (data: any) => infer TData;
} ? UseQueryResult<TData> : T extends {
    queryFn?: QueryFunction<infer TQueryFnData, any>;
} ? UseQueryResult<TQueryFnData> : UseQueryResult;
/**
 * QueriesOptions reducer recursively unwraps function arguments to infer/enforce type param
 */
export declare type QueriesOptions<T extends any[], Result extends any[] = [], Depth extends ReadonlyArray<number> = []> = Depth['length'] extends MAXIMUM_DEPTH ? UseQueryOptionsForUseQueries[] : T extends [] ? [] : T extends [infer Head] ? [...Result, GetOptions<Head>] : T extends [infer Head, ...infer Tail] ? QueriesOptions<[...Tail], [...Result, GetOptions<Head>], [...Depth, 1]> : unknown[] extends T ? T : T extends UseQueryOptionsForUseQueries<infer TQueryFnData, infer TError, infer TData, infer TQueryKey>[] ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData, TQueryKey>[] : UseQueryOptionsForUseQueries[];
/**
 * QueriesResults reducer recursively maps type param to results
 */
export declare type QueriesResults<T extends any[], Result extends any[] = [], Depth extends ReadonlyArray<number> = []> = Depth['length'] extends MAXIMUM_DEPTH ? UseQueryResult[] : T extends [] ? [] : T extends [infer Head] ? [...Result, GetResults<Head>] : T extends [infer Head, ...infer Tail] ? QueriesResults<[...Tail], [...Result, GetResults<Head>], [...Depth, 1]> : T extends UseQueryOptionsForUseQueries<infer TQueryFnData, infer TError, infer TData, any>[] ? UseQueryResult<unknown extends TData ? TQueryFnData : TData, TError>[] : UseQueryResult[];
export declare function useQueries<T extends any[]>({ queries, context, }: {
    queries: readonly [...QueriesOptions<T>];
    context?: UseQueryOptions['context'];
}): QueriesResults<T>;
export {};
//# sourceMappingURL=useQueries.d.ts.map