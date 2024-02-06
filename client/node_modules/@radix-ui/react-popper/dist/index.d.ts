import * as React from "react";
import * as ArrowPrimitive from "@radix-ui/react-arrow";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
import { Measurable } from "@radix-ui/rect";
export const SIDE_OPTIONS: readonly ["top", "right", "bottom", "left"];
export const ALIGN_OPTIONS: readonly ["start", "center", "end"];
type Side = typeof SIDE_OPTIONS[number];
type Align = typeof ALIGN_OPTIONS[number];
export const createPopperScope: import("@radix-ui/react-context").CreateScope;
export interface PopperProps {
    children?: React.ReactNode;
}
export const Popper: React.FC<PopperProps>;
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface PopperAnchorProps extends PrimitiveDivProps {
    virtualRef?: React.RefObject<Measurable>;
}
export const PopperAnchor: React.ForwardRefExoticComponent<PopperAnchorProps & React.RefAttributes<HTMLDivElement>>;
type Boundary = Element | null;
export interface PopperContentProps extends PrimitiveDivProps {
    side?: Side;
    sideOffset?: number;
    align?: Align;
    alignOffset?: number;
    arrowPadding?: number;
    avoidCollisions?: boolean;
    collisionBoundary?: Boundary | Boundary[];
    collisionPadding?: number | Partial<Record<Side, number>>;
    sticky?: 'partial' | 'always';
    hideWhenDetached?: boolean;
    updatePositionStrategy?: 'optimized' | 'always';
    onPlaced?: () => void;
}
export const PopperContent: React.ForwardRefExoticComponent<PopperContentProps & React.RefAttributes<HTMLDivElement>>;
type ArrowProps = Radix.ComponentPropsWithoutRef<typeof ArrowPrimitive.Root>;
export interface PopperArrowProps extends ArrowProps {
}
export const PopperArrow: React.ForwardRefExoticComponent<PopperArrowProps & React.RefAttributes<SVGSVGElement>>;
export const Root: React.FC<PopperProps>;
export const Anchor: React.ForwardRefExoticComponent<PopperAnchorProps & React.RefAttributes<HTMLDivElement>>;
export const Content: React.ForwardRefExoticComponent<PopperContentProps & React.RefAttributes<HTMLDivElement>>;
export const Arrow: React.ForwardRefExoticComponent<PopperArrowProps & React.RefAttributes<SVGSVGElement>>;

//# sourceMappingURL=index.d.ts.map
