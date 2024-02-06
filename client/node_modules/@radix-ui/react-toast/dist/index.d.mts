import * as React from "react";
import * as DismissableLayer from "@radix-ui/react-dismissable-layer";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type SwipeDirection = 'up' | 'down' | 'left' | 'right';
export const createToastScope: import("@radix-ui/react-context").CreateScope;
export interface ToastProviderProps {
    children?: React.ReactNode;
    /**
     * An author-localized label for each toast. Used to help screen reader users
     * associate the interruption with a toast.
     * @defaultValue 'Notification'
     */
    label?: string;
    /**
     * Time in milliseconds that each toast should remain visible for.
     * @defaultValue 5000
     */
    duration?: number;
    /**
     * Direction of pointer swipe that should close the toast.
     * @defaultValue 'right'
     */
    swipeDirection?: SwipeDirection;
    /**
     * Distance in pixels that the swipe must pass before a close is triggered.
     * @defaultValue 50
     */
    swipeThreshold?: number;
}
export const ToastProvider: React.FC<ToastProviderProps>;
type PrimitiveOrderedListProps = Radix.ComponentPropsWithoutRef<typeof Primitive.ol>;
export interface ToastViewportProps extends PrimitiveOrderedListProps {
    /**
     * The keys to use as the keyboard shortcut that will move focus to the toast viewport.
     * @defaultValue ['F8']
     */
    hotkey?: string[];
    /**
     * An author-localized label for the toast viewport to provide context for screen reader users
     * when navigating page landmarks. The available `{hotkey}` placeholder will be replaced for you.
     * @defaultValue 'Notifications ({hotkey})'
     */
    label?: string;
}
export const ToastViewport: React.ForwardRefExoticComponent<ToastViewportProps & React.RefAttributes<HTMLOListElement>>;
type ToastElement = ToastImplElement;
export interface ToastProps extends Omit<ToastImplProps, keyof ToastImplPrivateProps> {
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?(open: boolean): void;
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const Toast: React.ForwardRefExoticComponent<ToastProps & React.RefAttributes<HTMLLIElement>>;
type SwipeEvent = {
    currentTarget: EventTarget & ToastElement;
} & Omit<CustomEvent<{
    originalEvent: React.PointerEvent;
    delta: {
        x: number;
        y: number;
    };
}>, 'currentTarget'>;
type ToastImplElement = React.ElementRef<typeof Primitive.li>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer.Root>;
type ToastImplPrivateProps = {
    open: boolean;
    onClose(): void;
};
type PrimitiveListItemProps = Radix.ComponentPropsWithoutRef<typeof Primitive.li>;
interface ToastImplProps extends ToastImplPrivateProps, PrimitiveListItemProps {
    type?: 'foreground' | 'background';
    /**
     * Time in milliseconds that toast should remain visible for. Overrides value
     * given to `ToastProvider`.
     */
    duration?: number;
    onEscapeKeyDown?: DismissableLayerProps['onEscapeKeyDown'];
    onPause?(): void;
    onResume?(): void;
    onSwipeStart?(event: SwipeEvent): void;
    onSwipeMove?(event: SwipeEvent): void;
    onSwipeCancel?(event: SwipeEvent): void;
    onSwipeEnd?(event: SwipeEvent): void;
}
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface ToastTitleProps extends PrimitiveDivProps {
}
export const ToastTitle: React.ForwardRefExoticComponent<ToastTitleProps & React.RefAttributes<HTMLDivElement>>;
export interface ToastDescriptionProps extends PrimitiveDivProps {
}
export const ToastDescription: React.ForwardRefExoticComponent<ToastDescriptionProps & React.RefAttributes<HTMLDivElement>>;
export interface ToastActionProps extends ToastCloseProps {
    /**
     * A short description for an alternate way to carry out the action. For screen reader users
     * who will not be able to navigate to the button easily/quickly.
     * @example <ToastAction altText="Goto account settings to upgrade">Upgrade</ToastAction>
     * @example <ToastAction altText="Undo (Alt+U)">Undo</ToastAction>
     */
    altText: string;
}
export const ToastAction: React.ForwardRefExoticComponent<ToastActionProps & React.RefAttributes<HTMLButtonElement>>;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
export interface ToastCloseProps extends PrimitiveButtonProps {
}
export const ToastClose: React.ForwardRefExoticComponent<ToastCloseProps & React.RefAttributes<HTMLButtonElement>>;
export const Provider: React.FC<ToastProviderProps>;
export const Viewport: React.ForwardRefExoticComponent<ToastViewportProps & React.RefAttributes<HTMLOListElement>>;
export const Root: React.ForwardRefExoticComponent<ToastProps & React.RefAttributes<HTMLLIElement>>;
export const Title: React.ForwardRefExoticComponent<ToastTitleProps & React.RefAttributes<HTMLDivElement>>;
export const Description: React.ForwardRefExoticComponent<ToastDescriptionProps & React.RefAttributes<HTMLDivElement>>;
export const Action: React.ForwardRefExoticComponent<ToastActionProps & React.RefAttributes<HTMLButtonElement>>;
export const Close: React.ForwardRefExoticComponent<ToastCloseProps & React.RefAttributes<HTMLButtonElement>>;

//# sourceMappingURL=index.d.ts.map
