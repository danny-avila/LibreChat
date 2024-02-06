import type { Backend, Identifier } from 'dnd-core';
import type { DragPreviewOptions, DragSourceOptions } from '../types/index.js';
export interface Connector {
    hooks: any;
    connectTarget: any;
    receiveHandlerId(handlerId: Identifier | null): void;
    reconnect(): void;
}
export declare class SourceConnector implements Connector {
    hooks: any;
    private handlerId;
    private dragSourceRef;
    private dragSourceNode;
    private dragSourceOptionsInternal;
    private dragSourceUnsubscribe;
    private dragPreviewRef;
    private dragPreviewNode;
    private dragPreviewOptionsInternal;
    private dragPreviewUnsubscribe;
    private lastConnectedHandlerId;
    private lastConnectedDragSource;
    private lastConnectedDragSourceOptions;
    private lastConnectedDragPreview;
    private lastConnectedDragPreviewOptions;
    private readonly backend;
    constructor(backend: Backend);
    receiveHandlerId(newHandlerId: Identifier | null): void;
    get connectTarget(): any;
    get dragSourceOptions(): DragSourceOptions | null;
    set dragSourceOptions(options: DragSourceOptions | null);
    get dragPreviewOptions(): DragPreviewOptions | null;
    set dragPreviewOptions(options: DragPreviewOptions | null);
    reconnect(): void;
    private reconnectDragSource;
    private reconnectDragPreview;
    private didHandlerIdChange;
    private didConnectedDragSourceChange;
    private didConnectedDragPreviewChange;
    private didDragSourceOptionsChange;
    private didDragPreviewOptionsChange;
    disconnectDragSource(): void;
    disconnectDragPreview(): void;
    private get dragSource();
    private get dragPreview();
    private clearDragSource;
    private clearDragPreview;
}
