import * as React from "react";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { FocusScope } from "@radix-ui/react-focus-scope";
import * as PopperPrimitive from "@radix-ui/react-popper";
import { Portal as _Portal1 } from "@radix-ui/react-portal";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
export const createPopoverScope: import("@radix-ui/react-context").CreateScope;
export interface PopoverProps {
    children?: React.ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    modal?: boolean;
}
export const Popover: React.FC<PopoverProps>;
type PopperAnchorProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Anchor>;
export interface PopoverAnchorProps extends PopperAnchorProps {
}
export const PopoverAnchor: React.ForwardRefExoticComponent<PopoverAnchorProps & React.RefAttributes<HTMLDivElement>>;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
export interface PopoverTriggerProps extends PrimitiveButtonProps {
}
export const PopoverTrigger: React.ForwardRefExoticComponent<PopoverTriggerProps & React.RefAttributes<HTMLButtonElement>>;
type PortalProps = React.ComponentPropsWithoutRef<typeof _Portal1>;
export interface PopoverPortalProps {
    children?: React.ReactNode;
    /**
     * Specify a container element to portal the content into.
     */
    container?: PortalProps['container'];
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const PopoverPortal: React.FC<PopoverPortalProps>;
export interface PopoverContentProps extends PopoverContentTypeProps {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const PopoverContent: React.ForwardRefExoticComponent<PopoverContentProps & React.RefAttributes<HTMLDivElement>>;
interface PopoverContentTypeProps extends Omit<PopoverContentImplProps, 'trapFocus' | 'disableOutsidePointerEvents'> {
}
type FocusScopeProps = Radix.ComponentPropsWithoutRef<typeof FocusScope>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer>;
type PopperContentProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Content>;
interface PopoverContentImplProps extends Omit<PopperContentProps, 'onPlaced'>, Omit<DismissableLayerProps, 'onDismiss'> {
    /**
     * Whether focus should be trapped within the `Popover`
     * (default: false)
     */
    trapFocus?: FocusScopeProps['trapped'];
    /**
     * Event handler called when auto-focusing on open.
     * Can be prevented.
     */
    onOpenAutoFocus?: FocusScopeProps['onMountAutoFocus'];
    /**
     * Event handler called when auto-focusing on close.
     * Can be prevented.
     */
    onCloseAutoFocus?: FocusScopeProps['onUnmountAutoFocus'];
}
export interface PopoverCloseProps extends PrimitiveButtonProps {
}
export const PopoverClose: React.ForwardRefExoticComponent<PopoverCloseProps & React.RefAttributes<HTMLButtonElement>>;
type PopperArrowProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Arrow>;
export interface PopoverArrowProps extends PopperArrowProps {
}
export const PopoverArrow: React.ForwardRefExoticComponent<PopoverArrowProps & React.RefAttributes<SVGSVGElement>>;
export const Root: React.FC<PopoverProps>;
export const Anchor: React.ForwardRefExoticComponent<PopoverAnchorProps & React.RefAttributes<HTMLDivElement>>;
export const Trigger: React.ForwardRefExoticComponent<PopoverTriggerProps & React.RefAttributes<HTMLButtonElement>>;
export const Portal: React.FC<PopoverPortalProps>;
export const Content: React.ForwardRefExoticComponent<PopoverContentProps & React.RefAttributes<HTMLDivElement>>;
export const Close: React.ForwardRefExoticComponent<PopoverCloseProps & React.RefAttributes<HTMLButtonElement>>;
export const Arrow: React.ForwardRefExoticComponent<PopoverArrowProps & React.RefAttributes<SVGSVGElement>>;

//# sourceMappingURL=index.d.ts.map
