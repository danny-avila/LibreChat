import { shallowEqual } from '@react-dnd/shallowequal'
import type { Backend, Identifier, Unsubscribe } from 'dnd-core'
import type { ReactElement, Ref, RefObject } from 'react'

import type { DragPreviewOptions, DragSourceOptions } from '../types/index.js'
import { isRef } from './isRef.js'
import { wrapConnectorHooks } from './wrapConnectorHooks.js'

export interface Connector {
	hooks: any
	connectTarget: any
	receiveHandlerId(handlerId: Identifier | null): void
	reconnect(): void
}

export class SourceConnector implements Connector {
	public hooks = wrapConnectorHooks({
		dragSource: (
			node: Element | ReactElement | Ref<any>,
			options?: DragSourceOptions,
		) => {
			this.clearDragSource()
			this.dragSourceOptions = options || null
			if (isRef(node)) {
				this.dragSourceRef = node as RefObject<any>
			} else {
				this.dragSourceNode = node
			}
			this.reconnectDragSource()
		},
		dragPreview: (node: any, options?: DragPreviewOptions) => {
			this.clearDragPreview()
			this.dragPreviewOptions = options || null
			if (isRef(node)) {
				this.dragPreviewRef = node
			} else {
				this.dragPreviewNode = node
			}
			this.reconnectDragPreview()
		},
	})
	private handlerId: Identifier | null = null

	// The drop target may either be attached via ref or connect function
	private dragSourceRef: RefObject<any> | null = null
	private dragSourceNode: any
	private dragSourceOptionsInternal: DragSourceOptions | null = null
	private dragSourceUnsubscribe: Unsubscribe | undefined

	// The drag preview may either be attached via ref or connect function
	private dragPreviewRef: RefObject<any> | null = null
	private dragPreviewNode: any
	private dragPreviewOptionsInternal: DragPreviewOptions | null = null
	private dragPreviewUnsubscribe: Unsubscribe | undefined

	private lastConnectedHandlerId: Identifier | null = null
	private lastConnectedDragSource: any = null
	private lastConnectedDragSourceOptions: any = null
	private lastConnectedDragPreview: any = null
	private lastConnectedDragPreviewOptions: any = null

	private readonly backend: Backend

	public constructor(backend: Backend) {
		this.backend = backend
	}

	public receiveHandlerId(newHandlerId: Identifier | null): void {
		if (this.handlerId === newHandlerId) {
			return
		}

		this.handlerId = newHandlerId
		this.reconnect()
	}

	public get connectTarget(): any {
		return this.dragSource
	}

	public get dragSourceOptions(): DragSourceOptions | null {
		return this.dragSourceOptionsInternal
	}
	public set dragSourceOptions(options: DragSourceOptions | null) {
		this.dragSourceOptionsInternal = options
	}

	public get dragPreviewOptions(): DragPreviewOptions | null {
		return this.dragPreviewOptionsInternal
	}

	public set dragPreviewOptions(options: DragPreviewOptions | null) {
		this.dragPreviewOptionsInternal = options
	}

	public reconnect(): void {
		const didChange = this.reconnectDragSource()
		this.reconnectDragPreview(didChange)
	}

	private reconnectDragSource(): boolean {
		const dragSource = this.dragSource
		// if nothing has changed then don't resubscribe
		const didChange =
			this.didHandlerIdChange() ||
			this.didConnectedDragSourceChange() ||
			this.didDragSourceOptionsChange()

		if (didChange) {
			this.disconnectDragSource()
		}

		if (!this.handlerId) {
			return didChange
		}
		if (!dragSource) {
			this.lastConnectedDragSource = dragSource
			return didChange
		}

		if (didChange) {
			this.lastConnectedHandlerId = this.handlerId
			this.lastConnectedDragSource = dragSource
			this.lastConnectedDragSourceOptions = this.dragSourceOptions
			this.dragSourceUnsubscribe = this.backend.connectDragSource(
				this.handlerId,
				dragSource,
				this.dragSourceOptions,
			)
		}
		return didChange
	}

	private reconnectDragPreview(forceDidChange = false): void {
		const dragPreview = this.dragPreview
		// if nothing has changed then don't resubscribe
		const didChange =
			forceDidChange ||
			this.didHandlerIdChange() ||
			this.didConnectedDragPreviewChange() ||
			this.didDragPreviewOptionsChange()

		if (didChange) {
			this.disconnectDragPreview()
		}

		if (!this.handlerId) {
			return
		}
		if (!dragPreview) {
			this.lastConnectedDragPreview = dragPreview
			return
		}

		if (didChange) {
			this.lastConnectedHandlerId = this.handlerId
			this.lastConnectedDragPreview = dragPreview
			this.lastConnectedDragPreviewOptions = this.dragPreviewOptions
			this.dragPreviewUnsubscribe = this.backend.connectDragPreview(
				this.handlerId,
				dragPreview,
				this.dragPreviewOptions,
			)
		}
	}

	private didHandlerIdChange(): boolean {
		return this.lastConnectedHandlerId !== this.handlerId
	}

	private didConnectedDragSourceChange(): boolean {
		return this.lastConnectedDragSource !== this.dragSource
	}

	private didConnectedDragPreviewChange(): boolean {
		return this.lastConnectedDragPreview !== this.dragPreview
	}

	private didDragSourceOptionsChange(): boolean {
		return !shallowEqual(
			this.lastConnectedDragSourceOptions,
			this.dragSourceOptions,
		)
	}

	private didDragPreviewOptionsChange(): boolean {
		return !shallowEqual(
			this.lastConnectedDragPreviewOptions,
			this.dragPreviewOptions,
		)
	}

	public disconnectDragSource() {
		if (this.dragSourceUnsubscribe) {
			this.dragSourceUnsubscribe()
			this.dragSourceUnsubscribe = undefined
		}
	}

	public disconnectDragPreview() {
		if (this.dragPreviewUnsubscribe) {
			this.dragPreviewUnsubscribe()
			this.dragPreviewUnsubscribe = undefined
			this.dragPreviewNode = null
			this.dragPreviewRef = null
		}
	}

	private get dragSource() {
		return (
			this.dragSourceNode || (this.dragSourceRef && this.dragSourceRef.current)
		)
	}

	private get dragPreview() {
		return (
			this.dragPreviewNode ||
			(this.dragPreviewRef && this.dragPreviewRef.current)
		)
	}

	private clearDragSource() {
		this.dragSourceNode = null
		this.dragSourceRef = null
	}

	private clearDragPreview() {
		this.dragPreviewNode = null
		this.dragPreviewRef = null
	}
}
