import type { HandlerManager, MonitorEventEmitter } from '../types/index.js'
import { useCollector } from './useCollector.js'
import { useIsomorphicLayoutEffect } from './useIsomorphicLayoutEffect.js'

export function useMonitorOutput<Monitor extends HandlerManager, Collected>(
	monitor: Monitor & MonitorEventEmitter,
	collect: (monitor: Monitor) => Collected,
	onCollect?: () => void,
): Collected {
	const [collected, updateCollected] = useCollector(monitor, collect, onCollect)

	useIsomorphicLayoutEffect(
		function subscribeToMonitorStateChange() {
			const handlerId = monitor.getHandlerId()
			if (handlerId == null) {
				return
			}
			return monitor.subscribeToStateChange(updateCollected, {
				handlerIds: [handlerId],
			})
		},
		[monitor, updateCollected],
	)

	return collected
}
