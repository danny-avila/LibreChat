import * as React from "react";
import { DismissableLayer } from "@radix-ui/react-dismissable-layer";
import { FocusScope } from "@radix-ui/react-focus-scope";
import * as PopperPrimitive from "@radix-ui/react-popper";
import { Portal as _Portal1 } from "@radix-ui/react-portal";
import * as Radix from "@radix-ui/react-primitive";
import { Primitive } from "@radix-ui/react-primitive";
import * as RovingFocusGroup from "@radix-ui/react-roving-focus";
type Direction = 'ltr' | 'rtl';
export const createMenuScope: import("@radix-ui/react-context").CreateScope;
export interface MenuProps {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
    dir?: Direction;
    modal?: boolean;
}
export const Menu: React.FC<MenuProps>;
type PopperAnchorProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Anchor>;
export interface MenuAnchorProps extends PopperAnchorProps {
}
export const MenuAnchor: React.ForwardRefExoticComponent<MenuAnchorProps & React.RefAttributes<HTMLDivElement>>;
type PortalProps = React.ComponentPropsWithoutRef<typeof _Portal1>;
export interface MenuPortalProps {
    children?: React.ReactNode;
    /**
     * Specify a container element to portal the content into.
     */
    container?: PortalProps['container'];
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const MenuPortal: React.FC<MenuPortalProps>;
/**
 * We purposefully don't union MenuRootContent and MenuSubContent props here because
 * they have conflicting prop types. We agreed that we would allow MenuSubContent to
 * accept props that it would just ignore.
 */
export interface MenuContentProps extends MenuRootContentTypeProps {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const MenuContent: React.ForwardRefExoticComponent<MenuContentProps & React.RefAttributes<HTMLDivElement>>;
interface MenuRootContentTypeProps extends Omit<MenuContentImplProps, keyof MenuContentImplPrivateProps> {
}
type FocusScopeProps = Radix.ComponentPropsWithoutRef<typeof FocusScope>;
type DismissableLayerProps = Radix.ComponentPropsWithoutRef<typeof DismissableLayer>;
type RovingFocusGroupProps = Radix.ComponentPropsWithoutRef<typeof RovingFocusGroup.Root>;
type PopperContentProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Content>;
type MenuContentImplPrivateProps = {
    onOpenAutoFocus?: FocusScopeProps['onMountAutoFocus'];
    onDismiss?: DismissableLayerProps['onDismiss'];
    disableOutsidePointerEvents?: DismissableLayerProps['disableOutsidePointerEvents'];
    /**
     * Whether scrolling outside the `MenuContent` should be prevented
     * (default: `false`)
     */
    disableOutsideScroll?: boolean;
    /**
     * Whether focus should be trapped within the `MenuContent`
     * (default: false)
     */
    trapFocus?: FocusScopeProps['trapped'];
};
interface MenuContentImplProps extends MenuContentImplPrivateProps, Omit<PopperContentProps, 'dir' | 'onPlaced'> {
    /**
     * Event handler called when auto-focusing on close.
     * Can be prevented.
     */
    onCloseAutoFocus?: FocusScopeProps['onUnmountAutoFocus'];
    /**
     * Whether keyboard navigation should loop around
     * @defaultValue false
     */
    loop?: RovingFocusGroupProps['loop'];
    onEntryFocus?: RovingFocusGroupProps['onEntryFocus'];
    onEscapeKeyDown?: DismissableLayerProps['onEscapeKeyDown'];
    onPointerDownOutside?: DismissableLayerProps['onPointerDownOutside'];
    onFocusOutside?: DismissableLayerProps['onFocusOutside'];
    onInteractOutside?: DismissableLayerProps['onInteractOutside'];
}
type PrimitiveDivProps = Radix.ComponentPropsWithoutRef<typeof Primitive.div>;
export interface MenuGroupProps extends PrimitiveDivProps {
}
export const MenuGroup: React.ForwardRefExoticComponent<MenuGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface MenuLabelProps extends PrimitiveDivProps {
}
export const MenuLabel: React.ForwardRefExoticComponent<MenuLabelProps & React.RefAttributes<HTMLDivElement>>;
export interface MenuItemProps extends Omit<MenuItemImplProps, 'onSelect'> {
    onSelect?: (event: Event) => void;
}
export const MenuItem: React.ForwardRefExoticComponent<MenuItemProps & React.RefAttributes<HTMLDivElement>>;
interface MenuItemImplProps extends PrimitiveDivProps {
    disabled?: boolean;
    textValue?: string;
}
type CheckedState = boolean | 'indeterminate';
export interface MenuCheckboxItemProps extends MenuItemProps {
    checked?: CheckedState;
    onCheckedChange?: (checked: boolean) => void;
}
export const MenuCheckboxItem: React.ForwardRefExoticComponent<MenuCheckboxItemProps & React.RefAttributes<HTMLDivElement>>;
export interface MenuRadioGroupProps extends MenuGroupProps {
    value?: string;
    onValueChange?: (value: string) => void;
}
export const MenuRadioGroup: React.ForwardRefExoticComponent<MenuRadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export interface MenuRadioItemProps extends MenuItemProps {
    value: string;
}
export const MenuRadioItem: React.ForwardRefExoticComponent<MenuRadioItemProps & React.RefAttributes<HTMLDivElement>>;
type PrimitiveSpanProps = Radix.ComponentPropsWithoutRef<typeof Primitive.span>;
export interface MenuItemIndicatorProps extends PrimitiveSpanProps {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const MenuItemIndicator: React.ForwardRefExoticComponent<MenuItemIndicatorProps & React.RefAttributes<HTMLSpanElement>>;
export interface MenuSeparatorProps extends PrimitiveDivProps {
}
export const MenuSeparator: React.ForwardRefExoticComponent<MenuSeparatorProps & React.RefAttributes<HTMLDivElement>>;
type PopperArrowProps = Radix.ComponentPropsWithoutRef<typeof PopperPrimitive.Arrow>;
export interface MenuArrowProps extends PopperArrowProps {
}
export const MenuArrow: React.ForwardRefExoticComponent<MenuArrowProps & React.RefAttributes<SVGSVGElement>>;
export interface MenuSubProps {
    children?: React.ReactNode;
    open?: boolean;
    onOpenChange?(open: boolean): void;
}
export const MenuSub: React.FC<MenuSubProps>;
export interface MenuSubTriggerProps extends MenuItemImplProps {
}
export const MenuSubTrigger: React.ForwardRefExoticComponent<MenuSubTriggerProps & React.RefAttributes<HTMLDivElement>>;
export interface MenuSubContentProps extends Omit<MenuContentImplProps, keyof MenuContentImplPrivateProps | 'onCloseAutoFocus' | 'onEntryFocus' | 'side' | 'align'> {
    /**
     * Used to force mounting when more control is needed. Useful when
     * controlling animation with React animation libraries.
     */
    forceMount?: true;
}
export const MenuSubContent: React.ForwardRefExoticComponent<MenuSubContentProps & React.RefAttributes<HTMLDivElement>>;
export const Root: React.FC<MenuProps>;
export const Anchor: React.ForwardRefExoticComponent<MenuAnchorProps & React.RefAttributes<HTMLDivElement>>;
export const Portal: React.FC<MenuPortalProps>;
export const Content: React.ForwardRefExoticComponent<MenuContentProps & React.RefAttributes<HTMLDivElement>>;
export const Group: React.ForwardRefExoticComponent<MenuGroupProps & React.RefAttributes<HTMLDivElement>>;
export const Label: React.ForwardRefExoticComponent<MenuLabelProps & React.RefAttributes<HTMLDivElement>>;
export const Item: React.ForwardRefExoticComponent<MenuItemProps & React.RefAttributes<HTMLDivElement>>;
export const CheckboxItem: React.ForwardRefExoticComponent<MenuCheckboxItemProps & React.RefAttributes<HTMLDivElement>>;
export const RadioGroup: React.ForwardRefExoticComponent<MenuRadioGroupProps & React.RefAttributes<HTMLDivElement>>;
export const RadioItem: React.ForwardRefExoticComponent<MenuRadioItemProps & React.RefAttributes<HTMLDivElement>>;
export const ItemIndicator: React.ForwardRefExoticComponent<MenuItemIndicatorProps & React.RefAttributes<HTMLSpanElement>>;
export const Separator: React.ForwardRefExoticComponent<MenuSeparatorProps & React.RefAttributes<HTMLDivElement>>;
export const Arrow: React.ForwardRefExoticComponent<MenuArrowProps & React.RefAttributes<SVGSVGElement>>;
export const Sub: React.FC<MenuSubProps>;
export const SubTrigger: React.ForwardRefExoticComponent<MenuSubTriggerProps & React.RefAttributes<HTMLDivElement>>;
export const SubContent: React.ForwardRefExoticComponent<MenuSubContentProps & React.RefAttributes<HTMLDivElement>>;

//# sourceMappingURL=index.d.ts.map
