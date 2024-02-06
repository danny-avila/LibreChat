/// <reference types="jest" />
/// <reference types="node" />
import * as React from 'react';
import { render } from '@testing-library/react';
import { QueryClient } from '..';
import type { ContextOptions, MutationOptions, QueryClientConfig } from '..';
export declare function renderWithClient(client: QueryClient, ui: React.ReactElement, options?: ContextOptions): ReturnType<typeof render>;
export declare const Blink: ({ duration, children, }: {
    duration: number;
    children: React.ReactNode;
}) => JSX.Element;
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
export declare function expectType<T>(_: T): void;
/**
 * Assert the parameter is not typed as `any`
 */
export declare function expectTypeNotAny<T>(_: 0 extends 1 & T ? never : T): void;
export declare function executeMutation(queryClient: QueryClient, options: MutationOptions<any, any, any, any>): Promise<unknown>;
export declare function setIsServer(isServer: boolean): () => void;
//# sourceMappingURL=utils.d.ts.map