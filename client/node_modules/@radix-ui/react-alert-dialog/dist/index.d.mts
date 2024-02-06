import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Radix from "@radix-ui/react-primitive";
export const createAlertDialogScope: import("@radix-ui/react-context").CreateScope;
type DialogProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Root>;
export interface AlertDialogProps extends Omit<DialogProps, 'modal'> {
}
export const AlertDialog: React.FC<AlertDialogProps>;
type DialogTriggerProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Trigger>;
export interface AlertDialogTriggerProps extends DialogTriggerProps {
}
export const AlertDialogTrigger: React.ForwardRefExoticComponent<AlertDialogTriggerProps & React.RefAttributes<HTMLButtonElement>>;
type DialogPortalProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Portal>;
export interface AlertDialogPortalProps extends DialogPortalProps {
}
export const AlertDialogPortal: React.FC<AlertDialogPortalProps>;
type DialogOverlayProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>;
export interface AlertDialogOverlayProps extends DialogOverlayProps {
}
export const AlertDialogOverlay: React.ForwardRefExoticComponent<AlertDialogOverlayProps & React.RefAttributes<HTMLDivElement>>;
type DialogContentProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>;
export interface AlertDialogContentProps extends Omit<DialogContentProps, 'onPointerDownOutside' | 'onInteractOutside'> {
}
export const AlertDialogContent: React.ForwardRefExoticComponent<AlertDialogContentProps & React.RefAttributes<HTMLDivElement>>;
type DialogTitleProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>;
export interface AlertDialogTitleProps extends DialogTitleProps {
}
export const AlertDialogTitle: React.ForwardRefExoticComponent<AlertDialogTitleProps & React.RefAttributes<HTMLHeadingElement>>;
type DialogDescriptionProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>;
export interface AlertDialogDescriptionProps extends DialogDescriptionProps {
}
export const AlertDialogDescription: React.ForwardRefExoticComponent<AlertDialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>>;
type DialogCloseProps = Radix.ComponentPropsWithoutRef<typeof DialogPrimitive.Close>;
export interface AlertDialogActionProps extends DialogCloseProps {
}
export const AlertDialogAction: React.ForwardRefExoticComponent<AlertDialogActionProps & React.RefAttributes<HTMLButtonElement>>;
export interface AlertDialogCancelProps extends DialogCloseProps {
}
export const AlertDialogCancel: React.ForwardRefExoticComponent<AlertDialogCancelProps & React.RefAttributes<HTMLButtonElement>>;
export const Root: React.FC<AlertDialogProps>;
export const Trigger: React.ForwardRefExoticComponent<AlertDialogTriggerProps & React.RefAttributes<HTMLButtonElement>>;
export const Portal: React.FC<AlertDialogPortalProps>;
export const Overlay: React.ForwardRefExoticComponent<AlertDialogOverlayProps & React.RefAttributes<HTMLDivElement>>;
export const Content: React.ForwardRefExoticComponent<AlertDialogContentProps & React.RefAttributes<HTMLDivElement>>;
export const Action: React.ForwardRefExoticComponent<AlertDialogActionProps & React.RefAttributes<HTMLButtonElement>>;
export const Cancel: React.ForwardRefExoticComponent<AlertDialogCancelProps & React.RefAttributes<HTMLButtonElement>>;
export const Title: React.ForwardRefExoticComponent<AlertDialogTitleProps & React.RefAttributes<HTMLHeadingElement>>;
export const Description: React.ForwardRefExoticComponent<AlertDialogDescriptionProps & React.RefAttributes<HTMLParagraphElement>>;

//# sourceMappingURL=index.d.ts.map
