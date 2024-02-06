export interface DragSourceOptions {
    /**
     * Optional. A string. By default, 'move'. In the browsers that support this feature, specifying 'copy'
     * shows a special “copying” cursor, while 'move' corresponds to the “move” cursor. You might want to use
     * this option to provide a hint to the user about whether an action is destructive.
     */
    dropEffect?: string;
}
export interface DragPreviewOptions {
    /**
     * Optional. A boolean. By default, false. If true, the component will learn that it is being dragged immediately as the drag
     * starts instead of the next tick. This means that the screenshotting would occur with monitor.isDragging() already being true,
     * and if you apply any styling like a decreased opacity to the dragged element, this styling will also be reflected on the
     * screenshot. This is rarely desirable, so false is a sensible default. However, you might want to set it to true in rare cases,
     * such as if you want to make the custom drag layers work in IE and you need to hide the original element without resorting to
     * an empty drag preview which IE doesn't support.
     */
    captureDraggingState?: boolean;
    /**
     * Optional. A number between 0 and 1. By default, 0.5. Specifies how the offset relative to the drag source node is translated
     * into the horizontal offset of the drag preview when their sizes don't match. 0 means “dock the preview to the left”, 0.5 means
     * “interpolate linearly” and 1 means “dock the preview to the right”.
     */
    anchorX?: number;
    /**
     * Optional. A number between 0 and 1. By default, 0.5. Specifies how the offset relative to the drag source node is translated into
     * the vertical offset of the drag preview when their sizes don't match. 0 means “dock the preview to the top, 0.5 means “interpolate
     * linearly” and 1 means “dock the preview to the bottom.
     */
    anchorY?: number;
    /**
     * Optional. A number or null if not needed. By default, null. Specifies the vertical offset between the cursor and the drag preview
     * element. If offsetX has a value, anchorX won't be used.
     */
    offsetX?: number;
    /**
     *  Optional. A number or null if not needed. By default, null. Specifies the vertical offset between the cursor and the drag
     *  preview element. If offsetY has a value, anchorY won't be used.
     */
    offsetY?: number;
}
export declare type DropTargetOptions = any;
