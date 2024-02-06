import { type RenderOptions, render } from '@testing-library/react';
import * as React from 'react';
import { QueryCache, QueryClient } from '@tanstack/react-query';
import { ReactQueryDevtools } from '../devtools';
export declare function renderWithClient(client: QueryClient, ui: React.ReactElement, devtoolsOptions?: Parameters<typeof ReactQueryDevtools>[number], renderOptions?: RenderOptions): ReturnType<typeof render>;
export declare function sleep(timeout: number): Promise<void>;
/**
 * This method is useful for matching by text content when the text is splitted
 * across different HTML elements which cannot be searched by normal
 * *ByText methods. It returns a function that can be passed to the testing
 * library's *ByText methods.
 * @param textToMatch The string that needs to be matched
 * @reference https://stackoverflow.com/a/56859650/8252081
 */
declare type MatcherFunction = (content: string, element: Element | null) => boolean;
export declare const getByTextContent: (textToMatch: string) => MatcherFunction;
interface CreateQueryClientResponse {
    queryClient: QueryClient;
    queryCache: QueryCache;
}
export declare const createQueryClient: () => CreateQueryClientResponse;
export {};
//# sourceMappingURL=utils.d.ts.map