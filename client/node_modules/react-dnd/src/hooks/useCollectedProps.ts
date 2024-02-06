import type { Connector } from '../internals/index.js'
import type { HandlerManager, MonitorEventEmitter } from '../types/index.js'
import { useMonitorOutput } from './useMonitorOutput.js'

export function useCollectedProps<Collected, Monitor extends HandlerManager>(
	collector: ((monitor: Monitor) => Collected) | undefined,
	monitor: Monitor & MonitorEventEmitter,
	connector: Connector,
) {
	return useMonitorOutput(monitor, collector || (() => ({} as Collected)), () =>
		connector.reconnect(),
	)
}
