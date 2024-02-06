import type { Identifier, Unsubscribe } from 'dnd-core'

export interface XYCoord {
	x: number
	y: number
}

export interface HandlerManager {
	receiveHandlerId: (handlerId: Identifier | null) => void
	getHandlerId: () => Identifier | null
}

export interface DragSourceMonitor<DragObject = unknown, DropResult = unknown>
	extends HandlerManager,
		MonitorEventEmitter {
	/**
	 * Returns true if no drag operation is in progress, and the owner's canDrag() returns true or is not defined.
	 */
	canDrag(): boolean

	/**
	 *  Returns true if a drag operation is in progress, and either the owner initiated the drag, or its isDragging() is defined and returns true.
	 */
	isDragging(): boolean

	/**
	 * Returns a string or a symbol identifying the type of the current dragged item. Returns null if no item is being dragged.
	 */
	getItemType(): Identifier | null

	/**
	 * Returns a plain object representing the currently dragged item. Every drag source must specify it by returning an object from its beginDrag() method.
	 * Returns null if no item is being dragged.
	 */
	getItem<T = DragObject>(): T

	/**
	 * Returns a plain object representing the last recorded drop result. The drop targets may optionally specify it by returning an object from their
	 * drop() methods. When a chain of drop() is dispatched for the nested targets, bottom up, any parent that explicitly returns its own result from drop()
	 * overrides the child drop result previously set by the child. Returns null if called outside endDrag().
	 */
	getDropResult<T = DropResult>(): T | null

	/**
	 *  Returns true if some drop target has handled the drop event, false otherwise. Even if a target did not return a drop result, didDrop() returns true.
	 * Use it inside endDrag() to test whether any drop target has handled the drop. Returns false if called outside endDrag().
	 */
	didDrop(): boolean

	/**
	 * Returns the { x, y } client offset of the pointer at the time when the current drag operation has started. Returns null if no item is being dragged.
	 */
	getInitialClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } client offset of the drag source component's root DOM node at the time when the current drag operation has started.
	 * Returns null if no item is being dragged.
	 */
	getInitialSourceClientOffset(): XYCoord | null

	/**
	 * Returns the last recorded { x, y } client offset of the pointer while a drag operation is in progress. Returns null if no item is being dragged.
	 */
	getClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } difference between the last recorded client offset of the pointer and the client offset when the current drag operation has started.
	 * Returns null if no item is being dragged.
	 */
	getDifferenceFromInitialOffset(): XYCoord | null

	/**
	 * Returns the projected { x, y } client offset of the drag source component's root DOM node, based on its position at the time when the current drag operation has
	 * started, and the movement difference. Returns null if no item is being dragged.
	 */
	getSourceClientOffset(): XYCoord | null

	/**
	 * Returns the ids of the potential drop targets.
	 */
	getTargetIds(): Identifier[]
}

export interface MonitorEventEmitter {
	subscribeToStateChange(
		fn: () => void,
		options?: { handlerIds?: Identifier[] },
	): Unsubscribe
}

export interface DropTargetMonitor<DragObject = unknown, DropResult = unknown>
	extends HandlerManager,
		MonitorEventEmitter {
	/**
	 * Returns true if there is a drag operation in progress, and the owner's canDrop() returns true or is not defined.
	 */
	canDrop(): boolean

	/**
	 * Returns true if there is a drag operation in progress, and the pointer is currently hovering over the owner.
	 * You may optionally pass { shallow: true } to strictly check whether only the owner is being hovered, as opposed
	 * to a nested target.
	 */
	isOver(options?: { shallow?: boolean }): boolean

	/**
	 * Returns a string or a symbol identifying the type of the current dragged item. Returns null if no item is being dragged.
	 */
	getItemType(): Identifier | null

	/**
	 * Returns a plain object representing the currently dragged item. Every drag source must specify it by returning an object from
	 * its beginDrag() method. Returns null if no item is being dragged.
	 */
	getItem<T = DragObject>(): T

	/**
	 * Returns a plain object representing the last recorded drop result. The drop targets may optionally specify it by returning an
	 * object from their drop() methods. When a chain of drop() is dispatched for the nested targets, bottom up, any parent that explicitly
	 * returns its own result from drop() overrides the drop result previously set by the child. Returns null if called outside drop().
	 */
	getDropResult<T = DropResult>(): T | null

	/**
	 *  Returns true if some drop target has handled the drop event, false otherwise. Even if a target did not return a drop result,
	 * didDrop() returns true. Use it inside drop() to test whether any nested drop target has already handled the drop. Returns false
	 * if called outside drop().
	 */
	didDrop(): boolean

	/**
	 * Returns the { x, y } client offset of the pointer at the time when the current drag operation has started. Returns null if no item
	 * is being dragged.
	 */
	getInitialClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } client offset of the drag source component's root DOM node at the time when the current drag operation has started.
	 * Returns null if no item is being dragged.
	 */
	getInitialSourceClientOffset(): XYCoord | null

	/**
	 * Returns the last recorded { x, y } client offset of the pointer while a drag operation is in progress. Returns null if no item is being dragged.
	 */
	getClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } difference between the last recorded client offset of the pointer and the client offset when current the drag operation has
	 * started. Returns null if no item is being dragged.
	 */
	getDifferenceFromInitialOffset(): XYCoord | null

	/**
	 * Returns the projected { x, y } client offset of the drag source component's root DOM node, based on its position at the time when the current
	 * drag operation has started, and the movement difference. Returns null if no item is being dragged.
	 */
	getSourceClientOffset(): XYCoord | null
}

export interface DragLayerMonitor<DragObject = unknown> {
	/**
	 * Returns true if a drag operation is in progress. Returns false otherwise.
	 */
	isDragging(): boolean

	/**
	 * Returns a string or a symbol identifying the type of the current dragged item.
	 * Returns null if no item is being dragged.
	 */
	getItemType(): Identifier | null

	/**
	 * Returns a plain object representing the currently dragged item.
	 * Every drag source must specify it by returning an object from its beginDrag() method.
	 * Returns null if no item is being dragged.
	 */
	getItem<T = DragObject>(): T

	/**
	 * Returns the { x, y } client offset of the pointer at the time when the current drag operation has started.
	 * Returns null if no item is being dragged.
	 */
	getInitialClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } client offset of the drag source component's root DOM node at the time when the current
	 * drag operation has started. Returns null if no item is being dragged.
	 */
	getInitialSourceClientOffset(): XYCoord | null

	/**
	 * Returns the last recorded { x, y } client offset of the pointer while a drag operation is in progress.
	 * Returns null if no item is being dragged.
	 */
	getClientOffset(): XYCoord | null

	/**
	 * Returns the { x, y } difference between the last recorded client offset of the pointer and the client
	 * offset when current the drag operation has started. Returns null if no item is being dragged.
	 */
	getDifferenceFromInitialOffset(): XYCoord | null

	/**
	 * Returns the projected { x, y } client offset of the drag source component's root DOM node, based on its
	 * position at the time when the current drag operation has started, and the movement difference.
	 * Returns null if no item is being dragged.
	 */
	getSourceClientOffset(): XYCoord | null
}
