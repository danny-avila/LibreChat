import type {
	Backend,
	DragDropActions,
	DragDropManager,
	DragDropMonitor,
	HandlerRegistry,
	Identifier,
	Unsubscribe,
	XYCoord,
} from 'dnd-core'

import { EnterLeaveCounter } from './EnterLeaveCounter.js'
import {
	createNativeDragSource,
	matchNativeItemType,
} from './NativeDragSources/index.js'
import type { NativeDragSource } from './NativeDragSources/NativeDragSource.js'
import * as NativeTypes from './NativeTypes.js'
import {
	getDragPreviewOffset,
	getEventClientOffset,
	getNodeClientOffset,
} from './OffsetUtils.js'
import { OptionsReader } from './OptionsReader.js'
import type { HTML5BackendContext, HTML5BackendOptions } from './types.js'

type RootNode = Node & { __isReactDndBackendSetUp: boolean | undefined }

export class HTML5BackendImpl implements Backend {
	private options: OptionsReader

	// React-Dnd Components
	private actions: DragDropActions
	private monitor: DragDropMonitor
	private registry: HandlerRegistry

	// Internal State
	private enterLeaveCounter: EnterLeaveCounter

	private sourcePreviewNodes: Map<string, Element> = new Map()
	private sourcePreviewNodeOptions: Map<string, any> = new Map()
	private sourceNodes: Map<string, Element> = new Map()
	private sourceNodeOptions: Map<string, any> = new Map()

	private dragStartSourceIds: string[] | null = null
	private dropTargetIds: string[] = []
	private dragEnterTargetIds: string[] = []
	private currentNativeSource: NativeDragSource | null = null
	private currentNativeHandle: Identifier | null = null
	private currentDragSourceNode: Element | null = null
	private altKeyPressed = false
	private mouseMoveTimeoutTimer: number | null = null
	private asyncEndDragFrameId: number | null = null
	private dragOverTargetIds: string[] | null = null

	private lastClientOffset: XYCoord | null = null
	private hoverRafId: number | null = null

	public constructor(
		manager: DragDropManager,
		globalContext?: HTML5BackendContext,
		options?: HTML5BackendOptions,
	) {
		this.options = new OptionsReader(globalContext, options)
		this.actions = manager.getActions()
		this.monitor = manager.getMonitor()
		this.registry = manager.getRegistry()
		this.enterLeaveCounter = new EnterLeaveCounter(this.isNodeInDocument)
	}

	/**
	 * Generate profiling statistics for the HTML5Backend.
	 */
	public profile(): Record<string, number> {
		return {
			sourcePreviewNodes: this.sourcePreviewNodes.size,
			sourcePreviewNodeOptions: this.sourcePreviewNodeOptions.size,
			sourceNodeOptions: this.sourceNodeOptions.size,
			sourceNodes: this.sourceNodes.size,
			dragStartSourceIds: this.dragStartSourceIds?.length || 0,
			dropTargetIds: this.dropTargetIds.length,
			dragEnterTargetIds: this.dragEnterTargetIds.length,
			dragOverTargetIds: this.dragOverTargetIds?.length || 0,
		}
	}

	// public for test
	public get window(): Window | undefined {
		return this.options.window
	}
	public get document(): Document | undefined {
		return this.options.document
	}
	/**
	 * Get the root element to use for event subscriptions
	 */
	private get rootElement(): Node | undefined {
		return this.options.rootElement as Node
	}

	public setup(): void {
		const root = this.rootElement as RootNode | undefined
		if (root === undefined) {
			return
		}

		if (root.__isReactDndBackendSetUp) {
			throw new Error('Cannot have two HTML5 backends at the same time.')
		}
		root.__isReactDndBackendSetUp = true
		this.addEventListeners(root)
	}

	public teardown(): void {
		const root = this.rootElement as RootNode
		if (root === undefined) {
			return
		}

		root.__isReactDndBackendSetUp = false
		this.removeEventListeners(this.rootElement as Element)
		this.clearCurrentDragSourceNode()
		if (this.asyncEndDragFrameId) {
			this.window?.cancelAnimationFrame(this.asyncEndDragFrameId)
		}
	}

	public connectDragPreview(
		sourceId: string,
		node: Element,
		options: any,
	): Unsubscribe {
		this.sourcePreviewNodeOptions.set(sourceId, options)
		this.sourcePreviewNodes.set(sourceId, node)

		return (): void => {
			this.sourcePreviewNodes.delete(sourceId)
			this.sourcePreviewNodeOptions.delete(sourceId)
		}
	}

	public connectDragSource(
		sourceId: string,
		node: Element,
		options: any,
	): Unsubscribe {
		this.sourceNodes.set(sourceId, node)
		this.sourceNodeOptions.set(sourceId, options)

		const handleDragStart = (e: any) => this.handleDragStart(e, sourceId)
		const handleSelectStart = (e: any) => this.handleSelectStart(e)

		node.setAttribute('draggable', 'true')
		node.addEventListener('dragstart', handleDragStart)
		node.addEventListener('selectstart', handleSelectStart)

		return (): void => {
			this.sourceNodes.delete(sourceId)
			this.sourceNodeOptions.delete(sourceId)

			node.removeEventListener('dragstart', handleDragStart)
			node.removeEventListener('selectstart', handleSelectStart)
			node.setAttribute('draggable', 'false')
		}
	}

	public connectDropTarget(targetId: string, node: HTMLElement): Unsubscribe {
		const handleDragEnter = (e: DragEvent) => this.handleDragEnter(e, targetId)
		const handleDragOver = (e: DragEvent) => this.handleDragOver(e, targetId)
		const handleDrop = (e: DragEvent) => this.handleDrop(e, targetId)

		node.addEventListener('dragenter', handleDragEnter)
		node.addEventListener('dragover', handleDragOver)
		node.addEventListener('drop', handleDrop)

		return (): void => {
			node.removeEventListener('dragenter', handleDragEnter)
			node.removeEventListener('dragover', handleDragOver)
			node.removeEventListener('drop', handleDrop)
		}
	}

	private addEventListeners(target: Node) {
		// SSR Fix (https://github.com/react-dnd/react-dnd/pull/813
		if (!target.addEventListener) {
			return
		}
		target.addEventListener(
			'dragstart',
			this.handleTopDragStart as EventListener,
		)
		target.addEventListener('dragstart', this.handleTopDragStartCapture, true)
		target.addEventListener('dragend', this.handleTopDragEndCapture, true)
		target.addEventListener(
			'dragenter',
			this.handleTopDragEnter as EventListener,
		)
		target.addEventListener(
			'dragenter',
			this.handleTopDragEnterCapture as EventListener,
			true,
		)
		target.addEventListener(
			'dragleave',
			this.handleTopDragLeaveCapture as EventListener,
			true,
		)
		target.addEventListener('dragover', this.handleTopDragOver as EventListener)
		target.addEventListener(
			'dragover',
			this.handleTopDragOverCapture as EventListener,
			true,
		)
		target.addEventListener('drop', this.handleTopDrop as EventListener)
		target.addEventListener(
			'drop',
			this.handleTopDropCapture as EventListener,
			true,
		)
	}

	private removeEventListeners(target: Node) {
		// SSR Fix (https://github.com/react-dnd/react-dnd/pull/813
		if (!target.removeEventListener) {
			return
		}
		target.removeEventListener('dragstart', this.handleTopDragStart as any)
		target.removeEventListener(
			'dragstart',
			this.handleTopDragStartCapture,
			true,
		)
		target.removeEventListener('dragend', this.handleTopDragEndCapture, true)
		target.removeEventListener(
			'dragenter',
			this.handleTopDragEnter as EventListener,
		)
		target.removeEventListener(
			'dragenter',
			this.handleTopDragEnterCapture as EventListener,
			true,
		)
		target.removeEventListener(
			'dragleave',
			this.handleTopDragLeaveCapture as EventListener,
			true,
		)
		target.removeEventListener(
			'dragover',
			this.handleTopDragOver as EventListener,
		)
		target.removeEventListener(
			'dragover',
			this.handleTopDragOverCapture as EventListener,
			true,
		)
		target.removeEventListener('drop', this.handleTopDrop as EventListener)
		target.removeEventListener(
			'drop',
			this.handleTopDropCapture as EventListener,
			true,
		)
	}

	private getCurrentSourceNodeOptions() {
		const sourceId = this.monitor.getSourceId() as string
		const sourceNodeOptions = this.sourceNodeOptions.get(sourceId)

		return {
			dropEffect: this.altKeyPressed ? 'copy' : 'move',
			...(sourceNodeOptions || {}),
		}
	}

	private getCurrentDropEffect() {
		if (this.isDraggingNativeItem()) {
			// It makes more sense to default to 'copy' for native resources
			return 'copy'
		}

		return this.getCurrentSourceNodeOptions().dropEffect
	}

	private getCurrentSourcePreviewNodeOptions() {
		const sourceId = this.monitor.getSourceId() as string
		const sourcePreviewNodeOptions = this.sourcePreviewNodeOptions.get(sourceId)

		return {
			anchorX: 0.5,
			anchorY: 0.5,
			captureDraggingState: false,
			...(sourcePreviewNodeOptions || {}),
		}
	}

	private getSourceClientOffset = (sourceId: string): XYCoord | null => {
		const source = this.sourceNodes.get(sourceId)
		return (source && getNodeClientOffset(source as HTMLElement)) || null
	}

	private isDraggingNativeItem() {
		const itemType = this.monitor.getItemType()
		return Object.keys(NativeTypes).some(
			(key: string) => (NativeTypes as any)[key] === itemType,
		)
	}

	private beginDragNativeItem(type: string, dataTransfer?: DataTransfer) {
		this.clearCurrentDragSourceNode()

		this.currentNativeSource = createNativeDragSource(type, dataTransfer)
		this.currentNativeHandle = this.registry.addSource(
			type,
			this.currentNativeSource,
		)
		this.actions.beginDrag([this.currentNativeHandle])
	}

	private endDragNativeItem = (): void => {
		if (!this.isDraggingNativeItem()) {
			return
		}

		this.actions.endDrag()
		if (this.currentNativeHandle) {
			this.registry.removeSource(this.currentNativeHandle)
		}
		this.currentNativeHandle = null
		this.currentNativeSource = null
	}

	private isNodeInDocument = (node: Node | null | undefined): boolean => {
		// Check the node either in the main document or in the current context
		return Boolean(
			node &&
				this.document &&
				this.document.body &&
				this.document.body.contains(node),
		)
	}

	private endDragIfSourceWasRemovedFromDOM = (): void => {
		const node = this.currentDragSourceNode
		if (node == null || this.isNodeInDocument(node)) {
			return
		}

		if (this.clearCurrentDragSourceNode() && this.monitor.isDragging()) {
			this.actions.endDrag()
		}
		this.cancelHover()
	}

	private setCurrentDragSourceNode(node: Element | null) {
		this.clearCurrentDragSourceNode()
		this.currentDragSourceNode = node

		// A timeout of > 0 is necessary to resolve Firefox issue referenced
		// See:
		//   * https://github.com/react-dnd/react-dnd/pull/928
		//   * https://github.com/react-dnd/react-dnd/issues/869
		const MOUSE_MOVE_TIMEOUT = 1000

		// Receiving a mouse event in the middle of a dragging operation
		// means it has ended and the drag source node disappeared from DOM,
		// so the browser didn't dispatch the dragend event.
		//
		// We need to wait before we start listening for mousemove events.
		// This is needed because the drag preview needs to be drawn or else it fires an 'mousemove' event
		// immediately in some browsers.
		//
		// See:
		//   * https://github.com/react-dnd/react-dnd/pull/928
		//   * https://github.com/react-dnd/react-dnd/issues/869
		//
		this.mouseMoveTimeoutTimer = setTimeout(() => {
			return this.rootElement?.addEventListener(
				'mousemove',
				this.endDragIfSourceWasRemovedFromDOM,
				true,
			)
		}, MOUSE_MOVE_TIMEOUT) as any as number
	}

	private clearCurrentDragSourceNode() {
		if (this.currentDragSourceNode) {
			this.currentDragSourceNode = null

			if (this.rootElement) {
				this.window?.clearTimeout(this.mouseMoveTimeoutTimer || undefined)
				this.rootElement.removeEventListener(
					'mousemove',
					this.endDragIfSourceWasRemovedFromDOM,
					true,
				)
			}

			this.mouseMoveTimeoutTimer = null
			return true
		}

		return false
	}

	private scheduleHover = (dragOverTargetIds: string[] | null) => {
		if (
			this.hoverRafId === null &&
			typeof requestAnimationFrame !== 'undefined'
		) {
			this.hoverRafId = requestAnimationFrame(() => {
				if (this.monitor.isDragging()) {
					this.actions.hover(dragOverTargetIds || [], {
						clientOffset: this.lastClientOffset,
					})
				}

				this.hoverRafId = null
			})
		}
	}

	private cancelHover = () => {
		if (
			this.hoverRafId !== null &&
			typeof cancelAnimationFrame !== 'undefined'
		) {
			cancelAnimationFrame(this.hoverRafId)
			this.hoverRafId = null
		}
	}

	public handleTopDragStartCapture = (): void => {
		this.clearCurrentDragSourceNode()
		this.dragStartSourceIds = []
	}

	public handleDragStart(e: DragEvent, sourceId: string): void {
		if (e.defaultPrevented) {
			return
		}

		if (!this.dragStartSourceIds) {
			this.dragStartSourceIds = []
		}
		this.dragStartSourceIds.unshift(sourceId)
	}

	public handleTopDragStart = (e: DragEvent): void => {
		if (e.defaultPrevented) {
			return
		}

		const { dragStartSourceIds } = this
		this.dragStartSourceIds = null

		const clientOffset = getEventClientOffset(e)

		// Avoid crashing if we missed a drop event or our previous drag died
		if (this.monitor.isDragging()) {
			this.actions.endDrag()
			this.cancelHover()
		}

		// Don't publish the source just yet (see why below)
		this.actions.beginDrag(dragStartSourceIds || [], {
			publishSource: false,
			getSourceClientOffset: this.getSourceClientOffset,
			clientOffset,
		})

		const { dataTransfer } = e
		const nativeType = matchNativeItemType(dataTransfer)

		if (this.monitor.isDragging()) {
			if (dataTransfer && typeof dataTransfer.setDragImage === 'function') {
				// Use custom drag image if user specifies it.
				// If child drag source refuses drag but parent agrees,
				// use parent's node as drag image. Neither works in IE though.
				const sourceId: string = this.monitor.getSourceId() as string
				const sourceNode = this.sourceNodes.get(sourceId)
				const dragPreview = this.sourcePreviewNodes.get(sourceId) || sourceNode

				if (dragPreview) {
					const { anchorX, anchorY, offsetX, offsetY } =
						this.getCurrentSourcePreviewNodeOptions()
					const anchorPoint = { anchorX, anchorY }
					const offsetPoint = { offsetX, offsetY }
					const dragPreviewOffset = getDragPreviewOffset(
						sourceNode as HTMLElement,
						dragPreview as HTMLElement,
						clientOffset,
						anchorPoint,
						offsetPoint,
					)

					dataTransfer.setDragImage(
						dragPreview,
						dragPreviewOffset.x,
						dragPreviewOffset.y,
					)
				}
			}

			try {
				// Firefox won't drag without setting data
				dataTransfer?.setData('application/json', {} as any)
			} catch (err) {
				// IE doesn't support MIME types in setData
			}

			// Store drag source node so we can check whether
			// it is removed from DOM and trigger endDrag manually.
			this.setCurrentDragSourceNode(e.target as Element)

			// Now we are ready to publish the drag source.. or are we not?
			const { captureDraggingState } = this.getCurrentSourcePreviewNodeOptions()
			if (!captureDraggingState) {
				// Usually we want to publish it in the next tick so that browser
				// is able to screenshot the current (not yet dragging) state.
				//
				// It also neatly avoids a situation where render() returns null
				// in the same tick for the source element, and browser freaks out.
				setTimeout(() => this.actions.publishDragSource(), 0)
			} else {
				// In some cases the user may want to override this behavior, e.g.
				// to work around IE not supporting custom drag previews.
				//
				// When using a custom drag layer, the only way to prevent
				// the default drag preview from drawing in IE is to screenshot
				// the dragging state in which the node itself has zero opacity
				// and height. In this case, though, returning null from render()
				// will abruptly end the dragging, which is not obvious.
				//
				// This is the reason such behavior is strictly opt-in.
				this.actions.publishDragSource()
			}
		} else if (nativeType) {
			// A native item (such as URL) dragged from inside the document
			this.beginDragNativeItem(nativeType)
		} else if (
			dataTransfer &&
			!dataTransfer.types &&
			((e.target && !(e.target as Element).hasAttribute) ||
				!(e.target as Element).hasAttribute('draggable'))
		) {
			// Looks like a Safari bug: dataTransfer.types is null, but there was no draggable.
			// Just let it drag. It's a native type (URL or text) and will be picked up in
			// dragenter handler.
			return
		} else {
			// If by this time no drag source reacted, tell browser not to drag.
			e.preventDefault()
		}
	}

	public handleTopDragEndCapture = (): void => {
		if (this.clearCurrentDragSourceNode() && this.monitor.isDragging()) {
			// Firefox can dispatch this event in an infinite loop
			// if dragend handler does something like showing an alert.
			// Only proceed if we have not handled it already.
			this.actions.endDrag()
		}
		this.cancelHover()
	}

	public handleTopDragEnterCapture = (e: DragEvent): void => {
		this.dragEnterTargetIds = []

		if (this.isDraggingNativeItem()) {
			this.currentNativeSource?.loadDataTransfer(e.dataTransfer)
		}

		const isFirstEnter = this.enterLeaveCounter.enter(e.target)
		if (!isFirstEnter || this.monitor.isDragging()) {
			return
		}

		const { dataTransfer } = e
		const nativeType = matchNativeItemType(dataTransfer)

		if (nativeType) {
			// A native item (such as file or URL) dragged from outside the document
			this.beginDragNativeItem(nativeType, dataTransfer as DataTransfer)
		}
	}

	public handleDragEnter(_e: DragEvent, targetId: string): void {
		this.dragEnterTargetIds.unshift(targetId)
	}

	public handleTopDragEnter = (e: DragEvent): void => {
		const { dragEnterTargetIds } = this
		this.dragEnterTargetIds = []

		if (!this.monitor.isDragging()) {
			// This is probably a native item type we don't understand.
			return
		}

		this.altKeyPressed = e.altKey

		// If the target changes position as the result of `dragenter`, `dragover` might still
		// get dispatched despite target being no longer there. The easy solution is to check
		// whether there actually is a target before firing `hover`.
		if (dragEnterTargetIds.length > 0) {
			this.actions.hover(dragEnterTargetIds, {
				clientOffset: getEventClientOffset(e),
			})
		}

		const canDrop = dragEnterTargetIds.some((targetId) =>
			this.monitor.canDropOnTarget(targetId),
		)

		if (canDrop) {
			// IE requires this to fire dragover events
			e.preventDefault()
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = this.getCurrentDropEffect()
			}
		}
	}

	public handleTopDragOverCapture = (e: DragEvent): void => {
		this.dragOverTargetIds = []

		if (this.isDraggingNativeItem()) {
			this.currentNativeSource?.loadDataTransfer(e.dataTransfer)
		}
	}

	public handleDragOver(_e: DragEvent, targetId: string): void {
		if (this.dragOverTargetIds === null) {
			this.dragOverTargetIds = []
		}
		this.dragOverTargetIds.unshift(targetId)
	}

	public handleTopDragOver = (e: DragEvent): void => {
		const { dragOverTargetIds } = this
		this.dragOverTargetIds = []

		if (!this.monitor.isDragging()) {
			// This is probably a native item type we don't understand.
			// Prevent default "drop and blow away the whole document" action.
			e.preventDefault()
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'none'
			}
			return
		}

		this.altKeyPressed = e.altKey
		this.lastClientOffset = getEventClientOffset(e)

		this.scheduleHover(dragOverTargetIds)

		const canDrop = (dragOverTargetIds || []).some((targetId) =>
			this.monitor.canDropOnTarget(targetId),
		)

		if (canDrop) {
			// Show user-specified drop effect.
			e.preventDefault()
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = this.getCurrentDropEffect()
			}
		} else if (this.isDraggingNativeItem()) {
			// Don't show a nice cursor but still prevent default
			// "drop and blow away the whole document" action.
			e.preventDefault()
		} else {
			e.preventDefault()
			if (e.dataTransfer) {
				e.dataTransfer.dropEffect = 'none'
			}
		}
	}

	public handleTopDragLeaveCapture = (e: DragEvent): void => {
		if (this.isDraggingNativeItem()) {
			e.preventDefault()
		}

		const isLastLeave = this.enterLeaveCounter.leave(e.target)
		if (!isLastLeave) {
			return
		}

		if (this.isDraggingNativeItem()) {
			setTimeout(() => this.endDragNativeItem(), 0)
		}
		this.cancelHover()
	}

	public handleTopDropCapture = (e: DragEvent): void => {
		this.dropTargetIds = []

		if (this.isDraggingNativeItem()) {
			e.preventDefault()
			this.currentNativeSource?.loadDataTransfer(e.dataTransfer)
		} else if (matchNativeItemType(e.dataTransfer)) {
			// Dragging some elements, like <a> and <img> may still behave like a native drag event,
			// even if the current drag event matches a user-defined type.
			// Stop the default behavior when we're not expecting a native item to be dropped.

			e.preventDefault()
		}

		this.enterLeaveCounter.reset()
	}

	public handleDrop(_e: DragEvent, targetId: string): void {
		this.dropTargetIds.unshift(targetId)
	}

	public handleTopDrop = (e: DragEvent): void => {
		const { dropTargetIds } = this
		this.dropTargetIds = []

		this.actions.hover(dropTargetIds, {
			clientOffset: getEventClientOffset(e),
		})
		this.actions.drop({ dropEffect: this.getCurrentDropEffect() })

		if (this.isDraggingNativeItem()) {
			this.endDragNativeItem()
		} else if (this.monitor.isDragging()) {
			this.actions.endDrag()
		}
		this.cancelHover()
	}

	public handleSelectStart = (e: DragEvent): void => {
		const target = e.target as HTMLElement & { dragDrop: () => void }

		// Only IE requires us to explicitly say
		// we want drag drop operation to start
		if (typeof target.dragDrop !== 'function') {
			return
		}

		// Inputs and textareas should be selectable
		if (
			target.tagName === 'INPUT' ||
			target.tagName === 'SELECT' ||
			target.tagName === 'TEXTAREA' ||
			target.isContentEditable
		) {
			return
		}

		// For other targets, ask IE
		// to enable drag and drop
		e.preventDefault()
		target.dragDrop()
	}
}
