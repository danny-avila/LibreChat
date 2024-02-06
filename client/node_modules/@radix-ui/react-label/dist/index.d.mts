import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
type PrimitiveLabelProps = Radix.ComponentPropsWithoutRef<typeof Primitive.label>;
export interface LabelProps extends PrimitiveLabelProps {
}
export const Label: React.ForwardRefExoticComponent<LabelProps & React.RefAttributes<HTMLLabelElement>>;
export const Root: React.ForwardRefExoticComponent<LabelProps & React.RefAttributes<HTMLLabelElement>>;

//# sourceMappingURL=index.d.ts.map
