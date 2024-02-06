import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface DismissableLayerProps extends PrimitiveDivProps {
    /**
     * When `true`, hover/focus/click interactions will be disabled on elements outside
     * the `DismissableLayer`. Users will need to click twice on outside elements to
     * interact with them: once to close the `DismissableLayer`, and again to trigger the element.
     */
    disableOutsidePointerEvents?: boolean;
    /**
     * Event handler called when the escape key is down.
     * Can be prevented.
     */
    onEscapeKeyDown?: (event: KeyboardEvent) => void;
    /**
     * Event handler called when the a `pointerdown` event happens outside of the `DismissableLayer`.
     * Can be prevented.
     */
    onPointerDownOutside?: (event: PointerDownOutsideEvent) => void;
    /**
     * Event handler called when the focus moves outside of the `DismissableLayer`.
     * Can be prevented.
     */
    onFocusOutside?: (event: FocusOutsideEvent) => void;
    /**
     * Event handler called when an interaction happens outside the `DismissableLayer`.
     * Specifically, when a `pointerdown` event happens outside or focus moves outside of it.
     * Can be prevented.
     */
    onInteractOutside?: (event: PointerDownOutsideEvent | FocusOutsideEvent) => void;
    /**
     * Handler called when the `DismissableLayer` should be dismissed
     */
    onDismiss?: () => void;
}
export const DismissableLayer: React.ForwardRefExoticComponent<DismissableLayerProps & React.RefAttributes<HTMLDivElement>>;
interface DismissableLayerBranchProps extends PrimitiveDivProps {
}
export const DismissableLayerBranch: React.ForwardRefExoticComponent<DismissableLayerBranchProps & React.RefAttributes<HTMLDivElement>>;
type PointerDownOutsideEvent = CustomEvent<{
    originalEvent: PointerEvent;
}>;
type FocusOutsideEvent = CustomEvent<{
    originalEvent: FocusEvent;
}>;
export const Root: React.ForwardRefExoticComponent<DismissableLayerProps & React.RefAttributes<HTMLDivElement>>;
export const Branch: React.ForwardRefExoticComponent<DismissableLayerBranchProps & React.RefAttributes<HTMLDivElement>>;

//# sourceMappingURL=index.d.ts.map
