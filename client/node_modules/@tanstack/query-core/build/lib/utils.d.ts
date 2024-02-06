import type { Mutation } from './mutation';
import type { Query } from './query';
import type { FetchStatus, MutationFunction, MutationKey, MutationOptions, QueryFunction, QueryKey, QueryOptions } from './types';
export interface QueryFilters {
    /**
     * Filter to active queries, inactive queries or all queries
     */
    type?: QueryTypeFilter;
    /**
     * Match query key exactly
     */
    exact?: boolean;
    /**
     * Include queries matching this predicate function
     */
    predicate?: (query: Query) => boolean;
    /**
     * Include queries matching this query key
     */
    queryKey?: QueryKey;
    /**
     * Include or exclude stale queries
     */
    stale?: boolean;
    /**
     * Include queries matching their fetchStatus
     */
    fetchStatus?: FetchStatus;
}
export interface MutationFilters {
    /**
     * Match mutation key exactly
     */
    exact?: boolean;
    /**
     * Include mutations matching this predicate function
     */
    predicate?: (mutation: Mutation<any, any, any>) => boolean;
    /**
     * Include mutations matching this mutation key
     */
    mutationKey?: MutationKey;
    /**
     * Include or exclude fetching mutations
     */
    fetching?: boolean;
}
export declare type DataUpdateFunction<TInput, TOutput> = (input: TInput) => TOutput;
export declare type Updater<TInput, TOutput> = TOutput | DataUpdateFunction<TInput, TOutput>;
export declare type QueryTypeFilter = 'all' | 'active' | 'inactive';
export declare const isServer: boolean;
export declare function noop(): undefined;
export declare function functionalUpdate<TInput, TOutput>(updater: Updater<TInput, TOutput>, input: TInput): TOutput;
export declare function isValidTimeout(value: unknown): value is number;
export declare function difference<T>(array1: T[], array2: T[]): T[];
export declare function replaceAt<T>(array: T[], index: number, value: T): T[];
export declare function timeUntilStale(updatedAt: number, staleTime?: number): number;
export declare function parseQueryArgs<TOptions extends QueryOptions<any, any, any, TQueryKey>, TQueryKey extends QueryKey = QueryKey>(arg1: TQueryKey | TOptions, arg2?: QueryFunction<any, TQueryKey> | TOptions, arg3?: TOptions): TOptions;
export declare function parseMutationArgs<TOptions extends MutationOptions<any, any, any, any>>(arg1: MutationKey | MutationFunction<any, any> | TOptions, arg2?: MutationFunction<any, any> | TOptions, arg3?: TOptions): TOptions;
export declare function parseFilterArgs<TFilters extends QueryFilters, TOptions = unknown>(arg1?: QueryKey | TFilters, arg2?: TFilters | TOptions, arg3?: TOptions): [TFilters, TOptions | undefined];
export declare function parseMutationFilterArgs<TFilters extends MutationFilters, TOptions = unknown>(arg1?: QueryKey | TFilters, arg2?: TFilters | TOptions, arg3?: TOptions): [TFilters, TOptions | undefined];
export declare function matchQuery(filters: QueryFilters, query: Query<any, any, any, any>): boolean;
export declare function matchMutation(filters: MutationFilters, mutation: Mutation<any, any>): boolean;
export declare function hashQueryKeyByOptions<TQueryKey extends QueryKey = QueryKey>(queryKey: TQueryKey, options?: QueryOptions<any, any, any, TQueryKey>): string;
/**
 * Default query keys hash function.
 * Hashes the value into a stable hash.
 */
export declare function hashQueryKey(queryKey: QueryKey): string;
/**
 * Checks if key `b` partially matches with key `a`.
 */
export declare function partialMatchKey(a: QueryKey, b: QueryKey): boolean;
/**
 * Checks if `b` partially matches with `a`.
 */
export declare function partialDeepEqual(a: any, b: any): boolean;
/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
export declare function replaceEqualDeep<T>(a: unknown, b: T): T;
/**
 * Shallow compare objects. Only works with objects that always have the same properties.
 */
export declare function shallowEqualObjects<T>(a: T, b: T): boolean;
export declare function isPlainArray(value: unknown): boolean;
export declare function isPlainObject(o: any): o is Object;
export declare function isQueryKey(value: unknown): value is QueryKey;
export declare function isError(value: any): value is Error;
export declare function sleep(timeout: number): Promise<void>;
/**
 * Schedules a microtask.
 * This can be useful to schedule state updates after rendering.
 */
export declare function scheduleMicrotask(callback: () => void): void;
export declare function getAbortController(): AbortController | undefined;
export declare function replaceData<TData, TOptions extends QueryOptions<any, any, any, any>>(prevData: TData | undefined, data: TData, options: TOptions): TData;
//# sourceMappingURL=utils.d.ts.map