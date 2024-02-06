import type { ConnectDragPreview, ConnectDragSource } from '../../types/index.js';
import type { DragSourceHookSpec, FactoryOrInstance } from '../types.js';
/**
 * useDragSource hook
 * @param sourceSpec The drag source specification (object or function, function preferred)
 * @param deps The memoization deps array to use when evaluating spec changes
 */
export declare function useDrag<DragObject = unknown, DropResult = unknown, CollectedProps = unknown>(specArg: FactoryOrInstance<DragSourceHookSpec<DragObject, DropResult, CollectedProps>>, deps?: unknown[]): [CollectedProps, ConnectDragSource, ConnectDragPreview];
