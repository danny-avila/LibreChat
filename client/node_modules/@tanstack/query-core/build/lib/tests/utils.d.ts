/// <reference types="jest" />
/// <reference types="node" />
import { QueryClient } from '@tanstack/query-core';
import type { MutationOptions, QueryClientConfig } from '@tanstack/query-core';
export declare function createQueryClient(config?: QueryClientConfig): QueryClient;
export declare function mockVisibilityState(value: DocumentVisibilityState): jest.SpyInstance<DocumentVisibilityState, []>;
export declare function mockNavigatorOnLine(value: boolean): jest.SpyInstance<boolean, []>;
export declare const mockLogger: {
    log: jest.Mock<any, any>;
    warn: jest.Mock<any, any>;
    error: jest.Mock<any, any>;
};
export declare function queryKey(): Array<string>;
export declare function sleep(timeout: number): Promise<void>;
export declare function setActTimeout(fn: () => void, ms?: number): NodeJS.Timeout;
/**
 * Assert the parameter is of a specific type.
 */
export declare const expectType: <T>(_: T) => void;
/**
 * Assert the parameter is not typed as `any`
 */
export declare const expectTypeNotAny: <T>(_: 0 extends 1 & T ? never : T) => void;
export declare const executeMutation: (queryClient: QueryClient, options: MutationOptions<any, any, any, any>) => Promise<unknown>;
export declare function setIsServer(isServer: boolean): () => void;
//# sourceMappingURL=utils.d.ts.map