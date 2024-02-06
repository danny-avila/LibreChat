import type { HandlerManager, MonitorEventEmitter } from '../types/index.js';
export declare function useMonitorOutput<Monitor extends HandlerManager, Collected>(monitor: Monitor & MonitorEventEmitter, collect: (monitor: Monitor) => Collected, onCollect?: () => void): Collected;
