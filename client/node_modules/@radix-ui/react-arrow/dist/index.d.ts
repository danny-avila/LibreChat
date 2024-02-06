import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type PrimitiveSvgProps = Radix.ComponentPropsWithoutRef<typeof Primitive.svg>;
export interface ArrowProps extends PrimitiveSvgProps {
}
export const Arrow: React.ForwardRefExoticComponent<ArrowProps & React.RefAttributes<SVGSVGElement>>;
export const Root: React.ForwardRefExoticComponent<ArrowProps & React.RefAttributes<SVGSVGElement>>;

//# sourceMappingURL=index.d.ts.map
