import type { DragDropManager, Identifier, Listener, Unsubscribe, XYCoord } from 'dnd-core';
import type { DragSourceMonitor } from '../types/index.js';
export declare class DragSourceMonitorImpl implements DragSourceMonitor {
    private internalMonitor;
    private sourceId;
    constructor(manager: DragDropManager);
    receiveHandlerId(sourceId: Identifier | null): void;
    getHandlerId(): Identifier | null;
    canDrag(): boolean;
    isDragging(): boolean;
    subscribeToStateChange(listener: Listener, options?: {
        handlerIds?: Identifier[];
    }): Unsubscribe;
    isDraggingSource(sourceId: Identifier): boolean;
    isOverTarget(targetId: Identifier, options?: {
        shallow: boolean;
    }): boolean;
    getTargetIds(): Identifier[];
    isSourcePublic(): boolean | null;
    getSourceId(): Identifier | null;
    subscribeToOffsetChange(listener: Listener): Unsubscribe;
    canDragSource(sourceId: Identifier): boolean;
    canDropOnTarget(targetId: Identifier): boolean;
    getItemType(): Identifier | null;
    getItem(): any;
    getDropResult(): any;
    didDrop(): boolean;
    getInitialClientOffset(): XYCoord | null;
    getInitialSourceClientOffset(): XYCoord | null;
    getSourceClientOffset(): XYCoord | null;
    getClientOffset(): XYCoord | null;
    getDifferenceFromInitialOffset(): XYCoord | null;
}
