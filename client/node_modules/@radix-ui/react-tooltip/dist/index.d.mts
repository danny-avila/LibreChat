import * as React from "react";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import * as PopperPrimitive from "@radix-ui/react-popper";
import { Portal as _Portal1 } from "@radix-ui/react-portal";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
export const createTooltipScope: import("@radix-ui/react-context").CreateScope;
interface TooltipProviderProps {
    children: React.ReactNode;
    /**
     * The duration from when the pointer enters the trigger until the tooltip gets opened.
     * @defaultValue 700
     */
    delayDuration?: number;
    /**
     * How much time a user has to enter another trigger without incurring a delay again.
     * @defaultValue 300
     */
    skipDelayDuration?: number;
    /**
     * When `true`, trying to hover the content will result in the tooltip closing as the pointer leaves the trigger.
     * @defaultValue false
     */
    disableHoverableContent?: boolean;
}
export const TooltipProvider: React.FC<TooltipProviderProps>;
export interface TooltipProps {
    children?: React.ReactNode;
    open?: boolean;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    /**
     * The duration from when the pointer enters the trigger until the tooltip gets opened. This will
     * override the prop with the same name passed to Provider.
     * @defaultValue 700
     */
    delayDuration?: number;
    /**
     * When `true`, trying to hover the content will result in the tooltip closing as the pointer leaves the trigger.
     * @defaultValue false
     */
    disableHoverableContent?: boolean;
}
export const Tooltip: React.FC<TooltipProps>;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
export interface TooltipTriggerProps extends PrimitiveButtonProps {
}
export const TooltipTrigger: React.ForwardRefExoticComponent<TooltipTriggerProps & React.RefAttributes<HTMLButtonElement>>;
type PortalProps = React.ComponentPropsWithoutRef<typeof _Portal1>;
export interface TooltipPortalProps {
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
export const TooltipPortal: React.FC<TooltipPortalProps>;
export interface TooltipContentProps extends TooltipContentImplProps {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const TooltipContent: React.ForwardRefExoticComponent<TooltipContentProps & React.RefAttributes<HTMLDivElement>>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer>;
type PopperContentProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Content>;
interface TooltipContentImplProps extends Omit<PopperContentProps, 'onPlaced'> {
    /**
     * A more descriptive label for accessibility purpose
     */
    'aria-label'?: string;
    /**
     * Event handler called when the escape key is down.
     * Can be prevented.
     */
    onEscapeKeyDown?: DismissableLayerProps['onEscapeKeyDown'];
    /**
     * Event handler called when the a `pointerdown` event happens outside of the `Tooltip`.
     * Can be prevented.
     */
    onPointerDownOutside?: DismissableLayerProps['onPointerDownOutside'];
}
type PopperArrowProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Arrow>;
export interface TooltipArrowProps extends PopperArrowProps {
}
export const TooltipArrow: React.ForwardRefExoticComponent<TooltipArrowProps & React.RefAttributes<SVGSVGElement>>;
export const Provider: React.FC<TooltipProviderProps>;
export const Root: React.FC<TooltipProps>;
export const Trigger: React.ForwardRefExoticComponent<TooltipTriggerProps & React.RefAttributes<HTMLButtonElement>>;
export const Portal: React.FC<TooltipPortalProps>;
export const Content: React.ForwardRefExoticComponent<TooltipContentProps & React.RefAttributes<HTMLDivElement>>;
export const Arrow: React.ForwardRefExoticComponent<TooltipArrowProps & React.RefAttributes<SVGSVGElement>>;

//# sourceMappingURL=index.d.ts.map
