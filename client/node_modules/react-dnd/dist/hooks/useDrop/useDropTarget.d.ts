import type { DropTargetMonitor } from '../../types/index.js';
import type { DropTargetHookSpec } from '../types.js';
import { DropTargetImpl } from './DropTargetImpl.js';
export declare function useDropTarget<O, R, P>(spec: DropTargetHookSpec<O, R, P>, monitor: DropTargetMonitor<O, R>): DropTargetImpl<O, R, P>;
