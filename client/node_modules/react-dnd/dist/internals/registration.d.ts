import type { DragDropManager, DragSource, DropTarget, Identifier, SourceType, TargetType, Unsubscribe } from 'dnd-core';
export declare function registerTarget(type: TargetType, target: DropTarget, manager: DragDropManager): [Identifier, Unsubscribe];
export declare function registerSource(type: SourceType, source: DragSource, manager: DragDropManager): [Identifier, Unsubscribe];
