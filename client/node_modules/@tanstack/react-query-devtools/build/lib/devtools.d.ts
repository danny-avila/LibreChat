import * as React from 'react';
import type { Corner, Side } from './utils';
import type { ContextOptions, Query } from '@tanstack/react-query';
export interface DevToolsErrorType {
    /**
     * The name of the error.
     */
    name: string;
    /**
     * How the error is initialized. Whatever it returns MUST implement toString() so
     * we can check against the current error.
     */
    initializer: (query: Query) => {
        toString(): string;
    };
}
export interface DevtoolsOptions extends ContextOptions {
    /**
     * Set this true if you want the dev tools to default to being open
     */
    initialIsOpen?: boolean;
    /**
     * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
     */
    panelProps?: React.ComponentPropsWithoutRef<'div'>;
    /**
     * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
     */
    closeButtonProps?: React.ComponentPropsWithoutRef<'button'>;
    /**
     * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
     */
    toggleButtonProps?: React.ComponentPropsWithoutRef<'button'>;
    /**
     * The position of the React Query logo to open and close the devtools panel.
     * Defaults to 'bottom-left'.
     */
    position?: Corner;
    /**
     * The position of the React Query devtools panel.
     * Defaults to 'bottom'.
     */
    panelPosition?: Side;
    /**
     * Use this to render the devtools inside a different type of container element for a11y purposes.
     * Any string which corresponds to a valid intrinsic JSX element is allowed.
     * Defaults to 'aside'.
     */
    containerElement?: string | any;
    /**
     * nonce for style element for CSP
     */
    styleNonce?: string;
    /**
     * Use this so you can define custom errors that can be shown in the devtools.
     */
    errorTypes?: DevToolsErrorType[];
}
interface DevtoolsPanelOptions extends ContextOptions {
    /**
     * The standard React style object used to style a component with inline styles
     */
    style?: React.CSSProperties;
    /**
     * The standard React className property used to style a component with classes
     */
    className?: string;
    /**
     * A boolean variable indicating whether the panel is open or closed
     */
    isOpen?: boolean;
    /**
     * nonce for style element for CSP
     */
    styleNonce?: string;
    /**
     * A function that toggles the open and close state of the panel
     */
    setIsOpen: (isOpen: boolean) => void;
    /**
     * Handles the opening and closing the devtools panel
     */
    onDragStart: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
    /**
     * The position of the React Query devtools panel.
     * Defaults to 'bottom'.
     */
    position?: Side;
    /**
     * Handles the panel position select change
     */
    onPositionChange?: (side: Side) => void;
    /**
     * Show a close button inside the panel
     */
    showCloseButton?: boolean;
    /**
     * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
     */
    closeButtonProps?: React.ComponentPropsWithoutRef<'button'>;
    /**
     * Use this so you can define custom errors that can be shown in the devtools.
     */
    errorTypes?: DevToolsErrorType[];
}
export declare function ReactQueryDevtools({ initialIsOpen, panelProps, closeButtonProps, toggleButtonProps, position, containerElement: Container, context, styleNonce, panelPosition: initialPanelPosition, errorTypes, }: DevtoolsOptions): React.ReactElement | null;
export declare const ReactQueryDevtoolsPanel: React.ForwardRefExoticComponent<DevtoolsPanelOptions & React.RefAttributes<HTMLDivElement>>;
export {};
//# sourceMappingURL=devtools.d.ts.map