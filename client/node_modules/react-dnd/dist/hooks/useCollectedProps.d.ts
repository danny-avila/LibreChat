import type { Connector } from '../internals/index.js';
import type { HandlerManager, MonitorEventEmitter } from '../types/index.js';
export declare function useCollectedProps<Collected, Monitor extends HandlerManager>(collector: ((monitor: Monitor) => Collected) | undefined, monitor: Monitor & MonitorEventEmitter, connector: Connector): Collected;
