/// <reference types="react" />
import type { DragDropManager } from 'dnd-core';
/**
 * The React context type
 */
export interface DndContextType {
    dragDropManager: DragDropManager | undefined;
}
/**
 * Create the React Context
 */
export declare const DndContext: import("react").Context<DndContextType>;
