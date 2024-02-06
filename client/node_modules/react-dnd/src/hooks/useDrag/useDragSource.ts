import { useEffect, useMemo } from 'react'

import type { Connector } from '../../internals/index.js'
import type { DragSourceMonitor } from '../../types/index.js'
import type { DragSourceHookSpec } from '../types.js'
import { DragSourceImpl } from './DragSourceImpl.js'

export function useDragSource<O, R, P>(
	spec: DragSourceHookSpec<O, R, P>,
	monitor: DragSourceMonitor<O, R>,
	connector: Connector,
) {
	const handler = useMemo(
		() => new DragSourceImpl(spec, monitor, connector),
		[monitor, connector],
	)
	useEffect(() => {
		handler.spec = spec
	}, [spec])
	return handler
}
