import * as React from "react";
export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
    children?: React.ReactNode;
}
export const Slot: React.ForwardRefExoticComponent<SlotProps & React.RefAttributes<HTMLElement>>;
export const Slottable: ({ children }: {
    children: React.ReactNode;
}) => JSX.Element;
export const Root: React.ForwardRefExoticComponent<SlotProps & React.RefAttributes<HTMLElement>>;

//# sourceMappingURL=index.d.ts.map
