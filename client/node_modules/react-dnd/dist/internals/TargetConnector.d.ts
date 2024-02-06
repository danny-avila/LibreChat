import type { Backend, Identifier } from 'dnd-core';
import type { DropTargetOptions } from '../types/index.js';
import type { Connector } from './SourceConnector.js';
export declare class TargetConnector implements Connector {
    hooks: any;
    private handlerId;
    private dropTargetRef;
    private dropTargetNode;
    private dropTargetOptionsInternal;
    private unsubscribeDropTarget;
    private lastConnectedHandlerId;
    private lastConnectedDropTarget;
    private lastConnectedDropTargetOptions;
    private readonly backend;
    constructor(backend: Backend);
    get connectTarget(): any;
    reconnect(): void;
    receiveHandlerId(newHandlerId: Identifier | null): void;
    get dropTargetOptions(): DropTargetOptions;
    set dropTargetOptions(options: DropTargetOptions);
    private didHandlerIdChange;
    private didDropTargetChange;
    private didOptionsChange;
    disconnectDropTarget(): void;
    private get dropTarget();
    private clearDropTarget;
}
