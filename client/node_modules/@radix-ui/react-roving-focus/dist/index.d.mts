import * as React from "react";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
export const createRovingFocusGroupScope: import("@radix-ui/react-context").CreateScope;
type Orientation = React.AriaAttributes['aria-orientation'];
type Direction = 'ltr' | 'rtl';
interface RovingFocusGroupOptions {
    /**
     * The orientation of the group.
     * Mainly so arrow navigation is done accordingly (left & right vs. up & down)
     */
    orientation?: Orientation;
    /**
     * The direction of navigation between items.
     */
    dir?: Direction;
    /**
     * Whether keyboard navigation should loop around
     * @defaultValue false
     */
    loop?: boolean;
}
export interface RovingFocusGroupProps extends RovingFocusGroupImplProps {
}
export const RovingFocusGroup: React.ForwardRefExoticComponent<RovingFocusGroupProps & React.RefAttributes<HTMLDivElement>>;
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
interface RovingFocusGroupImplProps extends Omit<PrimitiveDivProps, 'dir'>, RovingFocusGroupOptions {
    currentTabStopId?: string | null;
    defaultCurrentTabStopId?: string;
    onCurrentTabStopIdChange?: (tabStopId: string | null) => void;
    onEntryFocus?: (event: Event) => void;
}
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
export interface RovingFocusItemProps extends PrimitiveSpanProps {
    tabStopId?: string;
    focusable?: boolean;
    active?: boolean;
}
export const RovingFocusGroupItem: React.ForwardRefExoticComponent<RovingFocusItemProps & React.RefAttributes<HTMLSpanElement>>;
export const Root: React.ForwardRefExoticComponent<RovingFocusGroupProps & React.RefAttributes<HTMLDivElement>>;
export const Item: React.ForwardRefExoticComponent<RovingFocusItemProps & React.RefAttributes<HTMLSpanElement>>;

//# sourceMappingURL=index.d.ts.map
