import type { TargetConnector } from '../../internals/index.js';
import type { DropTargetMonitor } from '../../types/index.js';
import type { DropTargetHookSpec } from '../types.js';
export declare function useRegisteredDropTarget<O, R, P>(spec: DropTargetHookSpec<O, R, P>, monitor: DropTargetMonitor<O, R>, connector: TargetConnector): void;
