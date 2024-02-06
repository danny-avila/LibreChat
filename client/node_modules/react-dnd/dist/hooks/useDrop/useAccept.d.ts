import type { Identifier } from 'dnd-core';
import type { DropTargetHookSpec } from '../types.js';
/**
 * Internal utility hook to get an array-version of spec.accept.
 * The main utility here is that we aren't creating a new array on every render if a non-array spec.accept is passed in.
 * @param spec
 */
export declare function useAccept<O, R, P>(spec: DropTargetHookSpec<O, R, P>): Identifier[];
