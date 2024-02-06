import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
export const createSwitchScope: import("@radix-ui/react-context").CreateScope;
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
export interface SwitchProps extends PrimitiveButtonProps {
    checked?: boolean;
    defaultChecked?: boolean;
    required?: boolean;
    onCheckedChange?(checked: boolean): void;
}
export const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLButtonElement>>;
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
export interface SwitchThumbProps extends PrimitiveSpanProps {
}
export const SwitchThumb: React.ForwardRefExoticComponent<SwitchThumbProps & React.RefAttributes<HTMLSpanElement>>;
export const Root: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLButtonElement>>;
export const Thumb: React.ForwardRefExoticComponent<SwitchThumbProps & React.RefAttributes<HTMLSpanElement>>;

//# sourceMappingURL=index.d.ts.map
