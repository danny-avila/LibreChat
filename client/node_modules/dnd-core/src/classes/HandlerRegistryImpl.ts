import { asap } from '@react-dnd/asap'
import { invariant } from '@react-dnd/invariant'
import type { Store } from 'redux'

import {
	addSource,
	addTarget,
	removeSource,
	removeTarget,
} from '../actions/registry.js'
import {
	validateSourceContract,
	validateTargetContract,
	validateType,
} from '../contracts.js'
import type {
	DragSource,
	DropTarget,
	HandlerRegistry,
	Identifier,
	SourceType,
	TargetType,
} from '../interfaces.js'
import { HandlerRole } from '../interfaces.js'
import type { State } from '../reducers/index.js'
import { getNextUniqueId } from '../utils/getNextUniqueId.js'

function getNextHandlerId(role: HandlerRole): string {
	const id = getNextUniqueId().toString()
	switch (role) {
		case HandlerRole.SOURCE:
			return `S${id}`
		case HandlerRole.TARGET:
			return `T${id}`
		default:
			throw new Error(`Unknown Handler Role: ${role}`)
	}
}

function parseRoleFromHandlerId(handlerId: string) {
	switch (handlerId[0]) {
		case 'S':
			return HandlerRole.SOURCE
		case 'T':
			return HandlerRole.TARGET
		default:
			throw new Error(`Cannot parse handler ID: ${handlerId}`)
	}
}

function mapContainsValue<T>(map: Map<string, T>, searchValue: T) {
	const entries = map.entries()
	let isDone = false
	do {
		const {
			done,
			value: [, value],
		} = entries.next()
		if (value === searchValue) {
			return true
		}
		isDone = !!done
	} while (!isDone)
	return false
}

export class HandlerRegistryImpl implements HandlerRegistry {
	private types: Map<string, SourceType | TargetType> = new Map()
	private dragSources: Map<string, DragSource> = new Map()
	private dropTargets: Map<string, DropTarget> = new Map()
	private pinnedSourceId: string | null = null
	private pinnedSource: any = null
	private store: Store<State>

	public constructor(store: Store<State>) {
		this.store = store
	}

	public addSource(type: SourceType, source: DragSource): string {
		validateType(type)
		validateSourceContract(source)

		const sourceId = this.addHandler(HandlerRole.SOURCE, type, source)
		this.store.dispatch(addSource(sourceId))
		return sourceId
	}

	public addTarget(type: TargetType, target: DropTarget): string {
		validateType(type, true)
		validateTargetContract(target)

		const targetId = this.addHandler(HandlerRole.TARGET, type, target)
		this.store.dispatch(addTarget(targetId))
		return targetId
	}

	public containsHandler(handler: DragSource | DropTarget): boolean {
		return (
			mapContainsValue(this.dragSources, handler) ||
			mapContainsValue(this.dropTargets, handler)
		)
	}

	public getSource(sourceId: string, includePinned = false): DragSource {
		invariant(this.isSourceId(sourceId), 'Expected a valid source ID.')
		const isPinned = includePinned && sourceId === this.pinnedSourceId
		const source = isPinned ? this.pinnedSource : this.dragSources.get(sourceId)
		return source
	}

	public getTarget(targetId: string): DropTarget {
		invariant(this.isTargetId(targetId), 'Expected a valid target ID.')
		return this.dropTargets.get(targetId) as DropTarget
	}

	public getSourceType(sourceId: string): Identifier {
		invariant(this.isSourceId(sourceId), 'Expected a valid source ID.')
		return this.types.get(sourceId) as Identifier
	}

	public getTargetType(targetId: string): Identifier | Identifier[] {
		invariant(this.isTargetId(targetId), 'Expected a valid target ID.')
		return this.types.get(targetId) as Identifier | Identifier[]
	}

	public isSourceId(handlerId: string): boolean {
		const role = parseRoleFromHandlerId(handlerId)
		return role === HandlerRole.SOURCE
	}

	public isTargetId(handlerId: string): boolean {
		const role = parseRoleFromHandlerId(handlerId)
		return role === HandlerRole.TARGET
	}

	public removeSource(sourceId: string): void {
		invariant(this.getSource(sourceId), 'Expected an existing source.')
		this.store.dispatch(removeSource(sourceId))
		asap(() => {
			this.dragSources.delete(sourceId)
			this.types.delete(sourceId)
		})
	}

	public removeTarget(targetId: string): void {
		invariant(this.getTarget(targetId), 'Expected an existing target.')
		this.store.dispatch(removeTarget(targetId))
		this.dropTargets.delete(targetId)
		this.types.delete(targetId)
	}

	public pinSource(sourceId: string): void {
		const source = this.getSource(sourceId)
		invariant(source, 'Expected an existing source.')

		this.pinnedSourceId = sourceId
		this.pinnedSource = source
	}

	public unpinSource(): void {
		invariant(this.pinnedSource, 'No source is pinned at the time.')

		this.pinnedSourceId = null
		this.pinnedSource = null
	}

	private addHandler(
		role: HandlerRole,
		type: SourceType | TargetType,
		handler: DragSource | DropTarget,
	): string {
		const id = getNextHandlerId(role)
		this.types.set(id, type)
		if (role === HandlerRole.SOURCE) {
			this.dragSources.set(id, handler as DragSource)
		} else if (role === HandlerRole.TARGET) {
			this.dropTargets.set(id, handler as DropTarget)
		}
		return id
	}
}
