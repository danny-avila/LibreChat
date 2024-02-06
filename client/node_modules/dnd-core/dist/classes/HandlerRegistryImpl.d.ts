import type { Store } from 'redux';
import type { DragSource, DropTarget, HandlerRegistry, Identifier, SourceType, TargetType } from '../interfaces.js';
import type { State } from '../reducers/index.js';
export declare class HandlerRegistryImpl implements HandlerRegistry {
    private types;
    private dragSources;
    private dropTargets;
    private pinnedSourceId;
    private pinnedSource;
    private store;
    constructor(store: Store<State>);
    addSource(type: SourceType, source: DragSource): string;
    addTarget(type: TargetType, target: DropTarget): string;
    containsHandler(handler: DragSource | DropTarget): boolean;
    getSource(sourceId: string, includePinned?: boolean): DragSource;
    getTarget(targetId: string): DropTarget;
    getSourceType(sourceId: string): Identifier;
    getTargetType(targetId: string): Identifier | Identifier[];
    isSourceId(handlerId: string): boolean;
    isTargetId(handlerId: string): boolean;
    removeSource(sourceId: string): void;
    removeTarget(targetId: string): void;
    pinSource(sourceId: string): void;
    unpinSource(): void;
    private addHandler;
}
