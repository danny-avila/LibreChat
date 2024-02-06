import type { Action } from '../interfaces.js';
import type { State as DirtyHandlerIdsState } from './dirtyHandlerIds.js';
import type { State as DragOffsetState } from './dragOffset.js';
import type { State as DragOperationState } from './dragOperation.js';
import type { State as RefCountState } from './refCount.js';
import type { State as StateIdState } from './stateId.js';
export interface State {
    dirtyHandlerIds: DirtyHandlerIdsState;
    dragOffset: DragOffsetState;
    refCount: RefCountState;
    dragOperation: DragOperationState;
    stateId: StateIdState;
}
export declare function reduce(state: State | undefined, action: Action<any>): State;
