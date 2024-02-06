import type { TargetConnector } from '../../internals/index.js'
import { registerTarget } from '../../internals/index.js'
import type { DropTargetMonitor } from '../../types/index.js'
import type { DropTargetHookSpec } from '../types.js'
import { useDragDropManager } from '../useDragDropManager.js'
import { useIsomorphicLayoutEffect } from '../useIsomorphicLayoutEffect.js'
import { useAccept } from './useAccept.js'
import { useDropTarget } from './useDropTarget.js'

export function useRegisteredDropTarget<O, R, P>(
	spec: DropTargetHookSpec<O, R, P>,
	monitor: DropTargetMonitor<O, R>,
	connector: TargetConnector,
): void {
	const manager = useDragDropManager()
	const dropTarget = useDropTarget(spec, monitor)
	const accept = useAccept(spec)

	useIsomorphicLayoutEffect(
		function registerDropTarget() {
			const [handlerId, unregister] = registerTarget(
				accept,
				dropTarget,
				manager,
			)
			monitor.receiveHandlerId(handlerId)
			connector.receiveHandlerId(handlerId)
			return unregister
		},
		[
			manager,
			monitor,
			dropTarget,
			connector,
			accept.map((a) => a.toString()).join('|'),
		],
	)
}
