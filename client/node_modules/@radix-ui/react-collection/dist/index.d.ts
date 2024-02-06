import React from "react";
import { Slot } from "@radix-ui/react-slot";
import * as Radix from "@radix-ui/react-primitive";
type SlotProps = Radix.ComponentPropsWithoutRef<typeof Slot>;
export interface CollectionProps extends SlotProps {
    scope: any;
}
export function createCollection<ItemElement extends HTMLElement, ItemData = {}>(name: string): readonly [{
    readonly Provider: React.FC<{
        children?: React.ReactNode;
        scope: any;
    }>;
    readonly Slot: React.ForwardRefExoticComponent<CollectionProps & React.RefAttributes<HTMLElement>>;
    readonly ItemSlot: React.ForwardRefExoticComponent<React.PropsWithoutRef<ItemData & {
        children: React.ReactNode;
        scope: any;
    }> & React.RefAttributes<ItemElement>>;
}, (scope: any) => () => ({
    ref: React.RefObject<ItemElement>;
} & ItemData)[], import("@radix-ui/react-context").CreateScope];

//# sourceMappingURL=index.d.ts.map
