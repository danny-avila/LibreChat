import { invariant } from '@react-dnd/invariant'

import type {
	Action,
	DragDropManager,
	DragDropMonitor,
	DropPayload,
	HandlerRegistry,
	Identifier,
} from '../../interfaces.js'
import { isObject } from '../../utils/js_utils.js'
import { DROP } from './types.js'

export function createDrop(manager: DragDropManager) {
	return function drop(options = {}): void {
		const monitor = manager.getMonitor()
		const registry = manager.getRegistry()
		verifyInvariants(monitor)
		const targetIds = getDroppableTargets(monitor)

		// Multiple actions are dispatched here, which is why this doesn't return an action
		targetIds.forEach((targetId, index) => {
			const dropResult = determineDropResult(targetId, index, registry, monitor)
			const action: Action<DropPayload> = {
				type: DROP,
				payload: {
					dropResult: {
						...options,
						...dropResult,
					},
				},
			}
			manager.dispatch(action)
		})
	}
}

function verifyInvariants(monitor: DragDropMonitor) {
	invariant(monitor.isDragging(), 'Cannot call drop while not dragging.')
	invariant(
		!monitor.didDrop(),
		'Cannot call drop twice during one drag operation.',
	)
}

function determineDropResult(
	targetId: Identifier,
	index: number,
	registry: HandlerRegistry,
	monitor: DragDropMonitor,
) {
	const target = registry.getTarget(targetId)
	let dropResult = target ? target.drop(monitor, targetId) : undefined
	verifyDropResultType(dropResult)
	if (typeof dropResult === 'undefined') {
		dropResult = index === 0 ? {} : monitor.getDropResult()
	}
	return dropResult
}

function verifyDropResultType(dropResult: any) {
	invariant(
		typeof dropResult === 'undefined' || isObject(dropResult),
		'Drop result must either be an object or undefined.',
	)
}

function getDroppableTargets(monitor: DragDropMonitor) {
	const targetIds = monitor
		.getTargetIds()
		.filter(monitor.canDropOnTarget, monitor)
	targetIds.reverse()
	return targetIds
}
