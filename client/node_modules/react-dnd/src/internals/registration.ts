import type {
	DragDropManager,
	DragSource,
	DropTarget,
	Identifier,
	SourceType,
	TargetType,
	Unsubscribe,
} from 'dnd-core'

export function registerTarget(
	type: TargetType,
	target: DropTarget,
	manager: DragDropManager,
): [Identifier, Unsubscribe] {
	const registry = manager.getRegistry()
	const targetId = registry.addTarget(type, target)

	return [targetId, () => registry.removeTarget(targetId)]
}

export function registerSource(
	type: SourceType,
	source: DragSource,
	manager: DragDropManager,
): [Identifier, Unsubscribe] {
	const registry = manager.getRegistry()
	const sourceId = registry.addSource(type, source)

	return [sourceId, () => registry.removeSource(sourceId)]
}
