import type { DragLayerMonitor } from '../types/index.js';
/**
 * useDragLayer Hook
 * @param collector The property collector
 */
export declare function useDragLayer<CollectedProps, DragObject = any>(collect: (monitor: DragLayerMonitor<DragObject>) => CollectedProps): CollectedProps;
