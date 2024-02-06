import * as React from 'react';
import type { HydrateOptions } from '@tanstack/query-core';
import type { ContextOptions } from './types';
export declare function useHydrate(state: unknown, options?: HydrateOptions & ContextOptions): void;
export interface HydrateProps {
    state?: unknown;
    options?: HydrateOptions;
    children?: React.ReactNode;
}
export declare const Hydrate: ({ children, options, state }: HydrateProps) => React.ReactElement<any, string | React.JSXElementConstructor<any>>;
//# sourceMappingURL=Hydrate.d.ts.map