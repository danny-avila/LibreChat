import type { QueryClient } from './queryClient';
import type { Query, QueryState } from './query';
import type { MutationKey, MutationOptions, QueryKey, QueryOptions } from './types';
import type { Mutation, MutationState } from './mutation';
export interface DehydrateOptions {
    dehydrateMutations?: boolean;
    dehydrateQueries?: boolean;
    shouldDehydrateMutation?: ShouldDehydrateMutationFunction;
    shouldDehydrateQuery?: ShouldDehydrateQueryFunction;
}
export interface HydrateOptions {
    defaultOptions?: {
        queries?: QueryOptions;
        mutations?: MutationOptions;
    };
}
interface DehydratedMutation {
    mutationKey?: MutationKey;
    state: MutationState;
}
interface DehydratedQuery {
    queryHash: string;
    queryKey: QueryKey;
    state: QueryState;
}
export interface DehydratedState {
    mutations: DehydratedMutation[];
    queries: DehydratedQuery[];
}
export declare type ShouldDehydrateQueryFunction = (query: Query) => boolean;
export declare type ShouldDehydrateMutationFunction = (mutation: Mutation) => boolean;
export declare function defaultShouldDehydrateMutation(mutation: Mutation): boolean;
export declare function defaultShouldDehydrateQuery(query: Query): boolean;
export declare function dehydrate(client: QueryClient, options?: DehydrateOptions): DehydratedState;
export declare function hydrate(client: QueryClient, dehydratedState: unknown, options?: HydrateOptions): void;
export {};
//# sourceMappingURL=hydration.d.ts.map