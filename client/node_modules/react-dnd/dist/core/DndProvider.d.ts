import type { BackendFactory, DragDropManager } from 'dnd-core';
import type { FC, ReactNode } from 'react';
export declare type DndProviderProps<BackendContext, BackendOptions> = {
    children?: ReactNode;
    manager: DragDropManager;
} | {
    backend: BackendFactory;
    children?: ReactNode;
    context?: BackendContext;
    options?: BackendOptions;
    debugMode?: boolean;
};
/**
 * A React component that provides the React-DnD context
 */
export declare const DndProvider: FC<DndProviderProps<unknown, unknown>>;
