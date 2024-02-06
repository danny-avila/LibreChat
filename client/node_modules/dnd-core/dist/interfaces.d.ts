export declare type Identifier = string | symbol;
export declare type SourceType = Identifier;
export declare type TargetType = Identifier | Identifier[];
export declare type Unsubscribe = () => void;
export declare type Listener = () => void;
export interface XYCoord {
    x: number;
    y: number;
}
export declare enum HandlerRole {
    SOURCE = "SOURCE",
    TARGET = "TARGET"
}
export interface Backend {
    setup(): void;
    teardown(): void;
    connectDragSource(sourceId: any, node?: any, options?: any): Unsubscribe;
    connectDragPreview(sourceId: any, node?: any, options?: any): Unsubscribe;
    connectDropTarget(targetId: any, node?: any, options?: any): Unsubscribe;
    profile(): Record<string, number>;
}
export interface DragDropMonitor {
    subscribeToStateChange(listener: Listener, options?: {
        handlerIds?: Identifier[];
    }): Unsubscribe;
    subscribeToOffsetChange(listener: Listener): Unsubscribe;
    canDragSource(sourceId: Identifier | undefined): boolean;
    canDropOnTarget(targetId: Identifier | undefined): boolean;
    /**
     * Returns true if a drag operation is in progress, and either the owner initiated the drag, or its isDragging()
     * is defined and returns true.
     */
    isDragging(): boolean;
    isDraggingSource(sourceId: Identifier | undefined): boolean;
    isOverTarget(targetId: Identifier | undefined, options?: {
        shallow?: boolean;
    }): boolean;
    /**
     * Returns a string or a symbol identifying the type of the current dragged item. Returns null if no item is being dragged.
     */
    getItemType(): Identifier | null;
    /**
     * Returns a plain object representing the currently dragged item. Every drag source must specify it by returning an object
     * from its beginDrag() method. Returns null if no item is being dragged.
     */
    getItem(): any;
    getSourceId(): Identifier | null;
    getTargetIds(): Identifier[];
    /**
     * Returns a plain object representing the last recorded drop result. The drop targets may optionally specify it by returning an
     * object from their drop() methods. When a chain of drop() is dispatched for the nested targets, bottom up, any parent that
     * explicitly returns its own result from drop() overrides the child drop result previously set by the child. Returns null if
     * called outside endDrag().
     */
    getDropResult(): any;
    /**
     * Returns true if some drop target has handled the drop event, false otherwise. Even if a target did not return a drop result,
     * didDrop() returns true. Use it inside endDrag() to test whether any drop target has handled the drop. Returns false if called
     * outside endDrag().
     */
    didDrop(): boolean;
    isSourcePublic(): boolean | null;
    /**
     * Returns the { x, y } client offset of the pointer at the time when the current drag operation has started.
     * Returns null if no item is being dragged.
     */
    getInitialClientOffset(): XYCoord | null;
    /**
     * Returns the { x, y } client offset of the drag source component's root DOM node at the time when the current drag
     * operation has started. Returns null if no item is being dragged.
     */
    getInitialSourceClientOffset(): XYCoord | null;
    /**
     * Returns the last recorded { x, y } client offset of the pointer while a drag operation is in progress.
     * Returns null if no item is being dragged.
     */
    getClientOffset(): XYCoord | null;
    /**
     * Returns the projected { x, y } client offset of the drag source component's root DOM node, based on its position at the time
     * when the current drag operation has started, and the movement difference. Returns null if no item is being dragged.
     */
    getSourceClientOffset(): XYCoord | null;
    /**
     * Returns the { x, y } difference between the last recorded client offset of the pointer and the client offset when the current
     * drag operation has started. Returns null if no item is being dragged.
     */
    getDifferenceFromInitialOffset(): XYCoord | null;
}
export interface HandlerRegistry {
    addSource(type: SourceType, source: DragSource): Identifier;
    addTarget(type: TargetType, target: DropTarget): Identifier;
    containsHandler(handler: DragSource | DropTarget): boolean;
    getSource(sourceId: Identifier, includePinned?: boolean): DragSource;
    getSourceType(sourceId: Identifier): SourceType;
    getTargetType(targetId: Identifier): TargetType;
    getTarget(targetId: Identifier): DropTarget;
    isSourceId(handlerId: Identifier): boolean;
    isTargetId(handlerId: Identifier): boolean;
    removeSource(sourceId: Identifier): void;
    removeTarget(targetId: Identifier): void;
    pinSource(sourceId: Identifier): void;
    unpinSource(): void;
}
export interface Action<Payload> {
    type: Identifier;
    payload: Payload;
}
export interface SentinelAction {
    type: Identifier;
}
export declare type ActionCreator<Payload> = (args: any[]) => Action<Payload>;
export interface BeginDragOptions {
    publishSource?: boolean;
    clientOffset?: XYCoord;
    getSourceClientOffset?: (sourceId: Identifier | undefined) => XYCoord;
}
export interface InitCoordsPayload {
    clientOffset: XYCoord | null;
    sourceClientOffset: XYCoord | null;
}
export interface BeginDragPayload {
    itemType: Identifier;
    item: any;
    sourceId: Identifier;
    clientOffset: XYCoord | null;
    sourceClientOffset: XYCoord | null;
    isSourcePublic: boolean;
}
export interface HoverPayload {
    targetIds: Identifier[];
    clientOffset: XYCoord | null;
}
export interface HoverOptions {
    clientOffset?: XYCoord;
}
export interface DropPayload {
    dropResult: any;
}
export interface TargetIdPayload {
    targetId: Identifier;
}
export interface SourceIdPayload {
    sourceId: Identifier;
}
export interface DragDropActions {
    beginDrag(sourceIds?: Identifier[], options?: any): Action<BeginDragPayload> | undefined;
    publishDragSource(): SentinelAction | undefined;
    hover(targetIds: Identifier[], options?: any): Action<HoverPayload>;
    drop(options?: any): void;
    endDrag(): SentinelAction;
}
export interface DragDropManager {
    getMonitor(): DragDropMonitor;
    getBackend(): Backend;
    getRegistry(): HandlerRegistry;
    getActions(): DragDropActions;
    dispatch(action: any): void;
}
export declare type BackendFactory = (manager: DragDropManager, globalContext?: any, configuration?: any) => Backend;
export interface DragSource {
    beginDrag(monitor: DragDropMonitor, targetId: Identifier): void;
    endDrag(monitor: DragDropMonitor, targetId: Identifier): void;
    canDrag(monitor: DragDropMonitor, targetId: Identifier): boolean;
    isDragging(monitor: DragDropMonitor, targetId: Identifier): boolean;
}
export interface DropTarget {
    canDrop(monitor: DragDropMonitor, targetId: Identifier): boolean;
    hover(monitor: DragDropMonitor, targetId: Identifier): void;
    drop(monitor: DragDropMonitor, targetId: Identifier): any;
}
