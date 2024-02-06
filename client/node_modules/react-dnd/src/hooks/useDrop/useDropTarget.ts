import { useEffect, useMemo } from 'react'

import type { DropTargetMonitor } from '../../types/index.js'
import type { DropTargetHookSpec } from '../types.js'
import { DropTargetImpl } from './DropTargetImpl.js'

export function useDropTarget<O, R, P>(
	spec: DropTargetHookSpec<O, R, P>,
	monitor: DropTargetMonitor<O, R>,
) {
	const dropTarget = useMemo(() => new DropTargetImpl(spec, monitor), [monitor])
	useEffect(() => {
		dropTarget.spec = spec
	}, [spec])
	return dropTarget
}
