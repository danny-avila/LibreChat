import type { Action, BeginDragOptions, BeginDragPayload, DragDropManager, Identifier } from '../../interfaces.js';
export declare function createBeginDrag(manager: DragDropManager): (sourceIds?: Identifier[], options?: BeginDragOptions) => Action<BeginDragPayload> | undefined;
