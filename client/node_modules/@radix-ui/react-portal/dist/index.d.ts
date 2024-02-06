import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface PortalProps extends PrimitiveDivProps {
    /**
     * An optional container where the portaled content should be appended.
     */
    container?: HTMLElement | null;
}
export const Portal: React.ForwardRefExoticComponent<PortalProps & React.RefAttributes<HTMLDivElement>>;
export const Root: React.ForwardRefExoticComponent<PortalProps & React.RefAttributes<HTMLDivElement>>;

//# sourceMappingURL=index.d.ts.map
