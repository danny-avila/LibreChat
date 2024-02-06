import { useMemo } from 'react'

import { DragSourceMonitorImpl } from '../../internals/index.js'
import type { DragSourceMonitor } from '../../types/index.js'
import { useDragDropManager } from '../useDragDropManager.js'

export function useDragSourceMonitor<O, R>(): DragSourceMonitor<O, R> {
	const manager = useDragDropManager()
	return useMemo<DragSourceMonitor<O, R>>(
		() => new DragSourceMonitorImpl(manager),
		[manager],
	)
}
