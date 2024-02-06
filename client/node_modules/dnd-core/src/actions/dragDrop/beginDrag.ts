import { invariant } from '@react-dnd/invariant'

import type {
	Action,
	BeginDragOptions,
	BeginDragPayload,
	DragDropManager,
	DragDropMonitor,
	HandlerRegistry,
	Identifier,
	XYCoord,
} from '../../interfaces.js'
import { isObject } from '../../utils/js_utils.js'
import { setClientOffset } from './local/setClientOffset.js'
import { BEGIN_DRAG, INIT_COORDS } from './types.js'

const ResetCoordinatesAction = {
	type: INIT_COORDS,
	payload: {
		clientOffset: null,
		sourceClientOffset: null,
	},
}

export function createBeginDrag(manager: DragDropManager) {
	return function beginDrag(
		sourceIds: Identifier[] = [],
		options: BeginDragOptions = {
			publishSource: true,
		},
	): Action<BeginDragPayload> | undefined {
		const {
			publishSource = true,
			clientOffset,
			getSourceClientOffset,
		}: BeginDragOptions = options
		const monitor = manager.getMonitor()
		const registry = manager.getRegistry()

		// Initialize the coordinates using the client offset
		manager.dispatch(setClientOffset(clientOffset))

		verifyInvariants(sourceIds, monitor, registry)

		// Get the draggable source
		const sourceId = getDraggableSource(sourceIds, monitor)
		if (sourceId == null) {
			manager.dispatch(ResetCoordinatesAction)
			return
		}

		// Get the source client offset
		let sourceClientOffset: XYCoord | null = null
		if (clientOffset) {
			if (!getSourceClientOffset) {
				throw new Error('getSourceClientOffset must be defined')
			}
			verifyGetSourceClientOffsetIsFunction(getSourceClientOffset)
			sourceClientOffset = getSourceClientOffset(sourceId)
		}

		// Initialize the full coordinates
		manager.dispatch(setClientOffset(clientOffset, sourceClientOffset))

		const source = registry.getSource(sourceId)
		const item = source.beginDrag(monitor, sourceId)
		// If source.beginDrag returns null, this is an indicator to cancel the drag
		if (item == null) {
			return undefined
		}
		verifyItemIsObject(item)
		registry.pinSource(sourceId)

		const itemType = registry.getSourceType(sourceId)
		return {
			type: BEGIN_DRAG,
			payload: {
				itemType,
				item,
				sourceId,
				clientOffset: clientOffset || null,
				sourceClientOffset: sourceClientOffset || null,
				isSourcePublic: !!publishSource,
			},
		}
	}
}

function verifyInvariants(
	sourceIds: Identifier[],
	monitor: DragDropMonitor,
	registry: HandlerRegistry,
) {
	invariant(!monitor.isDragging(), 'Cannot call beginDrag while dragging.')
	sourceIds.forEach(function (sourceId) {
		invariant(
			registry.getSource(sourceId),
			'Expected sourceIds to be registered.',
		)
	})
}

function verifyGetSourceClientOffsetIsFunction(getSourceClientOffset: any) {
	invariant(
		typeof getSourceClientOffset === 'function',
		'When clientOffset is provided, getSourceClientOffset must be a function.',
	)
}

function verifyItemIsObject(item: any) {
	invariant(isObject(item), 'Item must be an object.')
}

function getDraggableSource(sourceIds: Identifier[], monitor: DragDropMonitor) {
	let sourceId = null
	for (let i = sourceIds.length - 1; i >= 0; i--) {
		if (monitor.canDragSource(sourceIds[i])) {
			sourceId = sourceIds[i]
			break
		}
	}
	return sourceId
}
