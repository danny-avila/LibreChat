import type { Backend, DragDropManager, Unsubscribe } from 'dnd-core';
import type { HTML5BackendContext, HTML5BackendOptions } from './types.js';
export declare class HTML5BackendImpl implements Backend {
    private options;
    private actions;
    private monitor;
    private registry;
    private enterLeaveCounter;
    private sourcePreviewNodes;
    private sourcePreviewNodeOptions;
    private sourceNodes;
    private sourceNodeOptions;
    private dragStartSourceIds;
    private dropTargetIds;
    private dragEnterTargetIds;
    private currentNativeSource;
    private currentNativeHandle;
    private currentDragSourceNode;
    private altKeyPressed;
    private mouseMoveTimeoutTimer;
    private asyncEndDragFrameId;
    private dragOverTargetIds;
    private lastClientOffset;
    private hoverRafId;
    constructor(manager: DragDropManager, globalContext?: HTML5BackendContext, options?: HTML5BackendOptions);
    /**
     * Generate profiling statistics for the HTML5Backend.
     */
    profile(): Record<string, number>;
    get window(): Window | undefined;
    get document(): Document | undefined;
    /**
     * Get the root element to use for event subscriptions
     */
    private get rootElement();
    setup(): void;
    teardown(): void;
    connectDragPreview(sourceId: string, node: Element, options: any): Unsubscribe;
    connectDragSource(sourceId: string, node: Element, options: any): Unsubscribe;
    connectDropTarget(targetId: string, node: HTMLElement): Unsubscribe;
    private addEventListeners;
    private removeEventListeners;
    private getCurrentSourceNodeOptions;
    private getCurrentDropEffect;
    private getCurrentSourcePreviewNodeOptions;
    private getSourceClientOffset;
    private isDraggingNativeItem;
    private beginDragNativeItem;
    private endDragNativeItem;
    private isNodeInDocument;
    private endDragIfSourceWasRemovedFromDOM;
    private setCurrentDragSourceNode;
    private clearCurrentDragSourceNode;
    private scheduleHover;
    private cancelHover;
    handleTopDragStartCapture: () => void;
    handleDragStart(e: DragEvent, sourceId: string): void;
    handleTopDragStart: (e: DragEvent) => void;
    handleTopDragEndCapture: () => void;
    handleTopDragEnterCapture: (e: DragEvent) => void;
    handleDragEnter(_e: DragEvent, targetId: string): void;
    handleTopDragEnter: (e: DragEvent) => void;
    handleTopDragOverCapture: (e: DragEvent) => void;
    handleDragOver(_e: DragEvent, targetId: string): void;
    handleTopDragOver: (e: DragEvent) => void;
    handleTopDragLeaveCapture: (e: DragEvent) => void;
    handleTopDropCapture: (e: DragEvent) => void;
    handleDrop(_e: DragEvent, targetId: string): void;
    handleTopDrop: (e: DragEvent) => void;
    handleSelectStart: (e: DragEvent) => void;
}
