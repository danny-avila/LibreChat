import type * as React from 'react';
import { ReactNode } from 'react';
export declare function fillRef<T>(ref: React.Ref<T>, node: T): void;
/**
 * Merge refs into one ref function to support ref passing.
 */
export declare function composeRef<T>(...refs: React.Ref<T>[]): React.Ref<T>;
export declare function useComposeRef<T>(...refs: React.Ref<T>[]): React.Ref<T>;
export declare function supportRef(nodeOrComponent: any): boolean;
export declare function supportNodeRef(node: ReactNode): boolean;
