import { invariant } from '@react-dnd/invariant'

import type {
	Action,
	DragDropManager,
	DragDropMonitor,
	HandlerRegistry,
	HoverOptions,
	HoverPayload,
	Identifier,
} from '../../interfaces.js'
import { matchesType } from '../../utils/matchesType.js'
import { HOVER } from './types.js'

export function createHover(manager: DragDropManager) {
	return function hover(
		targetIdsArg: string[],
		{ clientOffset }: HoverOptions = {},
	): Action<HoverPayload> {
		verifyTargetIdsIsArray(targetIdsArg)
		const targetIds = targetIdsArg.slice(0)
		const monitor = manager.getMonitor()
		const registry = manager.getRegistry()
		const draggedItemType = monitor.getItemType()
		removeNonMatchingTargetIds(targetIds, registry, draggedItemType)
		checkInvariants(targetIds, monitor, registry)
		hoverAllTargets(targetIds, monitor, registry)

		return {
			type: HOVER,
			payload: {
				targetIds,
				clientOffset: clientOffset || null,
			},
		}
	}
}

function verifyTargetIdsIsArray(targetIdsArg: string[]) {
	invariant(Array.isArray(targetIdsArg), 'Expected targetIds to be an array.')
}

function checkInvariants(
	targetIds: string[],
	monitor: DragDropMonitor,
	registry: HandlerRegistry,
) {
	invariant(monitor.isDragging(), 'Cannot call hover while not dragging.')
	invariant(!monitor.didDrop(), 'Cannot call hover after drop.')
	for (let i = 0; i < targetIds.length; i++) {
		const targetId = targetIds[i] as string
		invariant(
			targetIds.lastIndexOf(targetId) === i,
			'Expected targetIds to be unique in the passed array.',
		)

		const target = registry.getTarget(targetId)
		invariant(target, 'Expected targetIds to be registered.')
	}
}

function removeNonMatchingTargetIds(
	targetIds: string[],
	registry: HandlerRegistry,
	draggedItemType: Identifier | null,
) {
	// Remove those targetIds that don't match the targetType.  This
	// fixes shallow isOver which would only be non-shallow because of
	// non-matching targets.
	for (let i = targetIds.length - 1; i >= 0; i--) {
		const targetId = targetIds[i] as string
		const targetType = registry.getTargetType(targetId)
		if (!matchesType(targetType, draggedItemType)) {
			targetIds.splice(i, 1)
		}
	}
}

function hoverAllTargets(
	targetIds: string[],
	monitor: DragDropMonitor,
	registry: HandlerRegistry,
) {
	// Finally call hover on all matching targets.
	targetIds.forEach(function (targetId) {
		const target = registry.getTarget(targetId)
		target.hover(monitor, targetId)
	})
}
