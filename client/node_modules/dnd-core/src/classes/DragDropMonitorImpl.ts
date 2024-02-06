import { invariant } from '@react-dnd/invariant'
import type { Store } from 'redux'

import type {
	DragDropMonitor,
	HandlerRegistry,
	Identifier,
	Listener,
	Unsubscribe,
	XYCoord,
} from '../interfaces.js'
import type { State } from '../reducers/index.js'
import {
	getDifferenceFromInitialOffset,
	getSourceClientOffset,
} from '../utils/coords.js'
import { areDirty } from '../utils/dirtiness.js'
import { matchesType } from '../utils/matchesType.js'

export class DragDropMonitorImpl implements DragDropMonitor {
	private store: Store<State>
	public readonly registry: HandlerRegistry

	public constructor(store: Store<State>, registry: HandlerRegistry) {
		this.store = store
		this.registry = registry
	}

	public subscribeToStateChange(
		listener: Listener,
		options: { handlerIds?: string[] } = {},
	): Unsubscribe {
		const { handlerIds } = options
		invariant(typeof listener === 'function', 'listener must be a function.')
		invariant(
			typeof handlerIds === 'undefined' || Array.isArray(handlerIds),
			'handlerIds, when specified, must be an array of strings.',
		)

		let prevStateId = this.store.getState().stateId
		const handleChange = () => {
			const state = this.store.getState()
			const currentStateId = state.stateId
			try {
				const canSkipListener =
					currentStateId === prevStateId ||
					(currentStateId === prevStateId + 1 &&
						!areDirty(state.dirtyHandlerIds, handlerIds))

				if (!canSkipListener) {
					listener()
				}
			} finally {
				prevStateId = currentStateId
			}
		}

		return this.store.subscribe(handleChange)
	}

	public subscribeToOffsetChange(listener: Listener): Unsubscribe {
		invariant(typeof listener === 'function', 'listener must be a function.')

		let previousState = this.store.getState().dragOffset
		const handleChange = () => {
			const nextState = this.store.getState().dragOffset
			if (nextState === previousState) {
				return
			}

			previousState = nextState
			listener()
		}

		return this.store.subscribe(handleChange)
	}

	public canDragSource(sourceId: string | undefined): boolean {
		if (!sourceId) {
			return false
		}
		const source = this.registry.getSource(sourceId)
		invariant(source, `Expected to find a valid source. sourceId=${sourceId}`)

		if (this.isDragging()) {
			return false
		}

		return source.canDrag(this, sourceId)
	}

	public canDropOnTarget(targetId: string | undefined): boolean {
		// undefined on initial render
		if (!targetId) {
			return false
		}
		const target = this.registry.getTarget(targetId)
		invariant(target, `Expected to find a valid target. targetId=${targetId}`)

		if (!this.isDragging() || this.didDrop()) {
			return false
		}

		const targetType = this.registry.getTargetType(targetId)
		const draggedItemType = this.getItemType()
		return (
			matchesType(targetType, draggedItemType) && target.canDrop(this, targetId)
		)
	}

	public isDragging(): boolean {
		return Boolean(this.getItemType())
	}

	public isDraggingSource(sourceId: string | undefined): boolean {
		// undefined on initial render
		if (!sourceId) {
			return false
		}
		const source = this.registry.getSource(sourceId, true)
		invariant(source, `Expected to find a valid source. sourceId=${sourceId}`)

		if (!this.isDragging() || !this.isSourcePublic()) {
			return false
		}

		const sourceType = this.registry.getSourceType(sourceId)
		const draggedItemType = this.getItemType()
		if (sourceType !== draggedItemType) {
			return false
		}

		return source.isDragging(this, sourceId)
	}

	public isOverTarget(
		targetId: string | undefined,
		options = { shallow: false },
	): boolean {
		// undefined on initial render
		if (!targetId) {
			return false
		}

		const { shallow } = options
		if (!this.isDragging()) {
			return false
		}

		const targetType = this.registry.getTargetType(targetId)
		const draggedItemType = this.getItemType()
		if (draggedItemType && !matchesType(targetType, draggedItemType)) {
			return false
		}

		const targetIds = this.getTargetIds()
		if (!targetIds.length) {
			return false
		}

		const index = targetIds.indexOf(targetId)
		if (shallow) {
			return index === targetIds.length - 1
		} else {
			return index > -1
		}
	}

	public getItemType(): Identifier {
		return this.store.getState().dragOperation.itemType as Identifier
	}

	public getItem(): any {
		return this.store.getState().dragOperation.item
	}

	public getSourceId(): string | null {
		return this.store.getState().dragOperation.sourceId
	}

	public getTargetIds(): string[] {
		return this.store.getState().dragOperation.targetIds
	}

	public getDropResult(): any {
		return this.store.getState().dragOperation.dropResult
	}

	public didDrop(): boolean {
		return this.store.getState().dragOperation.didDrop
	}

	public isSourcePublic(): boolean {
		return Boolean(this.store.getState().dragOperation.isSourcePublic)
	}

	public getInitialClientOffset(): XYCoord | null {
		return this.store.getState().dragOffset.initialClientOffset
	}

	public getInitialSourceClientOffset(): XYCoord | null {
		return this.store.getState().dragOffset.initialSourceClientOffset
	}

	public getClientOffset(): XYCoord | null {
		return this.store.getState().dragOffset.clientOffset
	}

	public getSourceClientOffset(): XYCoord | null {
		return getSourceClientOffset(this.store.getState().dragOffset)
	}

	public getDifferenceFromInitialOffset(): XYCoord | null {
		return getDifferenceFromInitialOffset(this.store.getState().dragOffset)
	}
}
