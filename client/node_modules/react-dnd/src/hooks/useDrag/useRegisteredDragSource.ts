import type { SourceConnector } from '../../internals/index.js'
import { registerSource } from '../../internals/index.js'
import type { DragSourceMonitor } from '../../types/index.js'
import type { DragSourceHookSpec } from '../types.js'
import { useDragDropManager } from '../useDragDropManager.js'
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js'
import { useDragSource } from './useDragSource.js'
import { useDragType } from './useDragType.js'

export function useRegisteredDragSource<O, R, P>(
	spec: DragSourceHookSpec<O, R, P>,
	monitor: DragSourceMonitor<O, R>,
	connector: SourceConnector,
): void {
	const manager = useDragDropManager()
	const handler = useDragSource(spec, monitor, connector)
	const itemType = useDragType(spec)

	useIsomorphicLayoutEffect(
		function registerDragSource() {
			if (itemType != null) {
				const [handlerId, unregister] = registerSource(
					itemType,
					handler,
					manager,
				)
				monitor.receiveHandlerId(handlerId)
				connector.receiveHandlerId(handlerId)
				return unregister
			}
			return
		},
		[manager, monitor, connector, handler, itemType],
	)
}
