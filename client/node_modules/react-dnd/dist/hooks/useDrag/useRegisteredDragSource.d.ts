import type { SourceConnector } from '../../internals/index.js';
import type { DragSourceMonitor } from '../../types/index.js';
import type { DragSourceHookSpec } from '../types.js';
export declare function useRegisteredDragSource<O, R, P>(spec: DragSourceHookSpec<O, R, P>, monitor: DragSourceMonitor<O, R>, connector: SourceConnector): void;
