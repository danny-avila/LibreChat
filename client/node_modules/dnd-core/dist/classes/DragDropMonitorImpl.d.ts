import type { Store } from 'redux';
import type { DragDropMonitor, HandlerRegistry, Identifier, Listener, Unsubscribe, XYCoord } from '../interfaces.js';
import type { State } from '../reducers/index.js';
export declare class DragDropMonitorImpl implements DragDropMonitor {
    private store;
    readonly registry: HandlerRegistry;
    constructor(store: Store<State>, registry: HandlerRegistry);
    subscribeToStateChange(listener: Listener, options?: {
        handlerIds?: string[];
    }): Unsubscribe;
    subscribeToOffsetChange(listener: Listener): Unsubscribe;
    canDragSource(sourceId: string | undefined): boolean;
    canDropOnTarget(targetId: string | undefined): boolean;
    isDragging(): boolean;
    isDraggingSource(sourceId: string | undefined): boolean;
    isOverTarget(targetId: string | undefined, options?: {
        shallow: boolean;
    }): boolean;
    getItemType(): Identifier;
    getItem(): any;
    getSourceId(): string | null;
    getTargetIds(): string[];
    getDropResult(): any;
    didDrop(): boolean;
    isSourcePublic(): boolean;
    getInitialClientOffset(): XYCoord | null;
    getInitialSourceClientOffset(): XYCoord | null;
    getClientOffset(): XYCoord | null;
    getSourceClientOffset(): XYCoord | null;
    getDifferenceFromInitialOffset(): XYCoord | null;
}
