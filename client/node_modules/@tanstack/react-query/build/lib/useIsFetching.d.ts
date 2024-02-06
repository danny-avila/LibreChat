import type { ContextOptions } from './types';
import type { QueryFilters, QueryKey } from '@tanstack/query-core';
interface Options extends ContextOptions {
}
export declare function useIsFetching(filters?: QueryFilters, options?: Options): number;
export declare function useIsFetching(queryKey?: QueryKey, filters?: QueryFilters, options?: Options): number;
export {};
//# sourceMappingURL=useIsFetching.d.ts.map