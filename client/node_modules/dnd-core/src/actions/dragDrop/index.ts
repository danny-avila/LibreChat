import type { DragDropActions, DragDropManager } from '../../interfaces.js'
import { createBeginDrag } from './beginDrag.js'
import { createDrop } from './drop.js'
import { createEndDrag } from './endDrag.js'
import { createHover } from './hover.js'
import { createPublishDragSource } from './publishDragSource.js'

export * from './types.js'

export function createDragDropActions(
	manager: DragDropManager,
): DragDropActions {
	return {
		beginDrag: createBeginDrag(manager),
		publishDragSource: createPublishDragSource(manager),
		hover: createHover(manager),
		drop: createDrop(manager),
		endDrag: createEndDrag(manager),
	}
}
