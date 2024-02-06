import type { QueryKey, QueryObserver } from '@tanstack/query-core';
import type { UseBaseQueryOptions } from './types';
export declare function useBaseQuery<TQueryFnData, TError, TData, TQueryData, TQueryKey extends QueryKey>(options: UseBaseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, Observer: typeof QueryObserver): import("@tanstack/query-core").QueryObserverResult<TData, TError>;
//# sourceMappingURL=useBaseQuery.d.ts.map