import type { FC } from 'react';
import type { ConnectDragPreview } from '../types/index.js';
export interface DragPreviewImageProps {
    connect: ConnectDragPreview;
    src: string;
}
/**
 * A utility for rendering a drag preview image
 */
export declare const DragPreviewImage: FC<DragPreviewImageProps>;
