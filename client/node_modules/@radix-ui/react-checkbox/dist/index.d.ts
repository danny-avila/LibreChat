import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
export const createCheckboxScope: import("@radix-ui/react-context").CreateScope;
type CheckedState = boolean | 'indeterminate';
type PrimitiveButtonProps = Radix.ComponentPropsWithoutRef<typeof Primitive.button>;
export interface CheckboxProps extends Omit<PrimitiveButtonProps, 'checked' | 'defaultChecked'> {
    checked?: CheckedState;
    defaultChecked?: CheckedState;
    required?: boolean;
    onCheckedChange?(checked: CheckedState): void;
}
export const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLButtonElement>>;
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
export interface CheckboxIndicatorProps extends PrimitiveSpanProps {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const CheckboxIndicator: React.ForwardRefExoticComponent<CheckboxIndicatorProps & React.RefAttributes<HTMLSpanElement>>;
export const Root: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLButtonElement>>;
export const Indicator: React.ForwardRefExoticComponent<CheckboxIndicatorProps & React.RefAttributes<HTMLSpanElement>>;

//# sourceMappingURL=index.d.ts.map
