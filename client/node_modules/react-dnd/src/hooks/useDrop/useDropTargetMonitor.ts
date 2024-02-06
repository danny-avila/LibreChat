import { useMemo } from 'react'

import { DropTargetMonitorImpl } from '../../internals/index.js'
import type { DropTargetMonitor } from '../../types/index.js'
import { useDragDropManager } from '../useDragDropManager.js'

export function useDropTargetMonitor<O, R>(): DropTargetMonitor<O, R> {
	const manager = useDragDropManager()
	return useMemo(() => new DropTargetMonitorImpl(manager), [manager])
}
