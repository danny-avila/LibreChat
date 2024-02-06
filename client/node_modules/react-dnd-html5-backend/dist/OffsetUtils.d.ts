import type { XYCoord } from 'dnd-core';
export declare function getNodeClientOffset(node: Node): XYCoord | null;
export declare function getEventClientOffset(e: MouseEvent): XYCoord;
export declare function getDragPreviewOffset(sourceNode: HTMLElement, dragPreview: HTMLElement, clientOffset: XYCoord, anchorPoint: {
    anchorX: number;
    anchorY: number;
}, offsetPoint: {
    offsetX: number;
    offsetY: number;
}): XYCoord;
