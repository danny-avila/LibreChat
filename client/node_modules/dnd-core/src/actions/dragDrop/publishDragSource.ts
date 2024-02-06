import type { DragDropManager, SentinelAction } from '../../interfaces.js'
import { PUBLISH_DRAG_SOURCE } from './types.js'

export function createPublishDragSource(manager: DragDropManager) {
	return function publishDragSource(): SentinelAction | undefined {
		const monitor = manager.getMonitor()
		if (monitor.isDragging()) {
			return { type: PUBLISH_DRAG_SOURCE }
		}
		return
	}
}
