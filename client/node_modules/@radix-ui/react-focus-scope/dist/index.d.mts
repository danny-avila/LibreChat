import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface FocusScopeProps extends PrimitiveDivProps {
    /**
     * When `true`, tabbing from last item will focus first tabbable
     * and shift+tab from first item will focus last tababble.
     * @defaultValue false
     */
    loop?: boolean;
    /**
     * When `true`, focus cannot escape the focus scope via keyboard,
     * pointer, or a programmatic focus.
     * @defaultValue false
     */
    trapped?: boolean;
    /**
     * Event handler called when auto-focusing on mount.
     * Can be prevented.
     */
    onMountAutoFocus?: (event: Event) => void;
    /**
     * Event handler called when auto-focusing on unmount.
     * Can be prevented.
     */
    onUnmountAutoFocus?: (event: Event) => void;
}
export const FocusScope: React.ForwardRefExoticComponent<FocusScopeProps & React.RefAttributes<HTMLDivElement>>;
export const Root: React.ForwardRefExoticComponent<FocusScopeProps & React.RefAttributes<HTMLDivElement>>;

//# sourceMappingURL=index.d.ts.map
