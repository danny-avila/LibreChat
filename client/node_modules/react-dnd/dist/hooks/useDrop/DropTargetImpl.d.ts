import type { DropTarget } from 'dnd-core';
import type { DropTargetMonitor } from '../../types/index.js';
import type { DropTargetHookSpec } from '../types.js';
export declare class DropTargetImpl<O, R, P> implements DropTarget {
    spec: DropTargetHookSpec<O, R, P>;
    private monitor;
    constructor(spec: DropTargetHookSpec<O, R, P>, monitor: DropTargetMonitor<O, R>);
    canDrop(): boolean;
    hover(): void;
    drop(): R | undefined;
}
