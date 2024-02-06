import type { Connector } from '../../internals/index.js';
import type { DragSourceMonitor } from '../../types/index.js';
import type { DragSourceHookSpec } from '../types.js';
import { DragSourceImpl } from './DragSourceImpl.js';
export declare function useDragSource<O, R, P>(spec: DragSourceHookSpec<O, R, P>, monitor: DragSourceMonitor<O, R>, connector: Connector): DragSourceImpl<O, R, P>;
