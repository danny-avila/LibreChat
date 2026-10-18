import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useId,
  useRef,
  useState,
} from 'react';
import * as Ariakit from '@ariakit/react';
import {
  Tabs as AppTabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  OGDialog,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogFooter,
  OGDialogContent,
  OGDialogDescription,
  HoverCard as AppHoverCard,
  HoverCardTrigger,
  HoverCardContent,
  HoverCardPortal,
  DropdownPopup,
} from '@librechat/client';
import type { MutableRefObject, ReactElement, ReactNode } from 'react';
import type { IconName } from './Icon';
import { Button } from './controls';
import { Icon } from './Icon';
import { cn } from '~/utils';

/**
 * Click-ui's dialogs, menus, hover cards and tabs, on SassyChat's own (Radix and Ariakit)
 * primitives, keeping the call shape the admin panel uses.
 */

/* ── Dialog ─────────────────────────────────────────────────────────────── */

const DialogCloseContext = createContext<MutableRefObject<(() => void) | undefined> | null>(null);

interface DialogProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}

function DialogRoot({ open, onOpenChange, children }: DialogProps) {
  const onClose = useRef<(() => void) | undefined>(undefined);
  return (
    <DialogCloseContext.Provider value={onClose}>
      <OGDialog
        open={open}
        onOpenChange={(next) => {
          onOpenChange?.(next);
          if (!next) {
            onClose.current?.();
          }
        }}
      >
        {children}
      </OGDialog>
    </DialogCloseContext.Provider>
  );
}

interface DialogContentProps {
  title?: ReactNode;
  showClose?: boolean;
  onClose?: () => void;
  className?: string;
  children?: ReactNode;
  'aria-describedby'?: string;
}

function DialogContent({
  title,
  showClose,
  onClose,
  className,
  children,
  ...props
}: DialogContentProps) {
  const closeRef = useContext(DialogCloseContext);
  if (closeRef) {
    closeRef.current = onClose;
  }
  return (
    <OGDialogContent
      showCloseButton={showClose ?? true}
      className={cn('max-h-[90vh] w-11/12 max-w-2xl overflow-y-auto', className)}
      {...props}
    >
      {title ? (
        <OGDialogHeader>
          <OGDialogTitle>{title}</OGDialogTitle>
        </OGDialogHeader>
      ) : (
        <OGDialogTitle className="sr-only">{''}</OGDialogTitle>
      )}
      {children}
    </OGDialogContent>
  );
}

export const Dialog = Object.assign(DialogRoot, { Content: DialogContent });

export interface ConfirmationDialogProps {
  open: boolean;
  title: ReactNode;
  message?: ReactNode;
  children?: ReactNode;
  primaryActionLabel: string;
  primaryActionType?: 'primary' | 'danger';
  secondaryActionLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  showClose?: boolean;
  className?: string;
}

/** A question with a confirming and a cancelling action. */
export function ConfirmationDialog({
  open,
  title,
  message,
  children,
  primaryActionLabel,
  primaryActionType = 'primary',
  secondaryActionLabel,
  loading,
  disabled,
  onConfirm,
  onCancel,
  showClose,
  className,
}: ConfirmationDialogProps) {
  return (
    <OGDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <OGDialogContent
        showCloseButton={showClose ?? false}
        className={cn('w-11/12 max-w-md', className)}
      >
        <OGDialogHeader>
          <OGDialogTitle>{title}</OGDialogTitle>
          {message && <OGDialogDescription>{message}</OGDialogDescription>}
        </OGDialogHeader>
        {children}
        <OGDialogFooter className="gap-2">
          {secondaryActionLabel && (
            <Button type="secondary" onClick={onCancel} disabled={loading}>
              {secondaryActionLabel}
            </Button>
          )}
          <Button
            type={primaryActionType}
            onClick={onConfirm}
            loading={loading}
            disabled={disabled}
          >
            {primaryActionLabel}
          </Button>
        </OGDialogFooter>
      </OGDialogContent>
    </OGDialog>
  );
}

/* ── Dropdown (SassyChat's DropdownPopup with an Ariakit menu button) ────── */

interface DropdownItemProps {
  icon?: IconName;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children?: ReactNode;
}

function DropdownItem(_props: DropdownItemProps): null {
  return null;
}

function DropdownTrigger(_props: { children: ReactElement }): null {
  return null;
}

function DropdownContent(_props: { children?: ReactNode }): null {
  return null;
}

function labelText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(labelText).join('');
  }
  return '';
}

function DropdownRoot({ children }: { children?: ReactNode }) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  let trigger: ReactElement | undefined;
  const items: DropdownItemProps[] = [];
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) {
      continue;
    }
    if (child.type === DropdownTrigger) {
      const only = Children.only(child.props.children);
      trigger = isValidElement(only) ? only : undefined;
    } else if (child.type === DropdownContent) {
      for (const item of Children.toArray(child.props.children)) {
        if (isValidElement<DropdownItemProps>(item) && item.type === DropdownItem) {
          items.push(item.props);
        }
      }
    }
  }
  if (!trigger) {
    return null;
  }
  return (
    <DropdownPopup
      menuId={menuId}
      isOpen={open}
      setIsOpen={setOpen}
      trigger={<Ariakit.MenuButton render={trigger} />}
      items={items.map((item, index) => ({
        id: `${menuId}-${index}`,
        label: labelText(item.children),
        ariaLabel: item.title,
        icon: item.icon ? <Icon name={item.icon} size="sm" aria-hidden /> : undefined,
        disabled: item.disabled,
        className: item.className,
        onClick: () => item.onClick?.(),
      }))}
    />
  );
}

export const Dropdown = Object.assign(DropdownRoot, {
  Trigger: DropdownTrigger,
  Content: DropdownContent,
  Item: DropdownItem,
});

/* ── Hover card ─────────────────────────────────────────────────────────── */

function HoverCardContentAdapter({
  className,
  children,
  side,
  align,
}: {
  className?: string;
  children?: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <HoverCardPortal>
      <HoverCardContent side={side} align={align} className={cn('z-50', className)}>
        {children}
      </HoverCardContent>
    </HoverCardPortal>
  );
}

export const HoverCard = Object.assign(
  ({ openDelay, children }: { openDelay?: number; children?: ReactNode }) => (
    <AppHoverCard openDelay={openDelay}>{children}</AppHoverCard>
  ),
  { Trigger: HoverCardTrigger, Content: HoverCardContentAdapter },
);

/* ── Tabs ───────────────────────────────────────────────────────────────── */

const TabsLabelContext = createContext<string | undefined>(undefined);

function TabsRoot({
  value,
  onValueChange,
  ariaLabel,
  className,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <TabsLabelContext.Provider value={ariaLabel}>
      <AppTabs value={value} onValueChange={onValueChange} className={className}>
        {children}
      </AppTabs>
    </TabsLabelContext.Provider>
  );
}

function TabsTriggersList({ className, children }: { className?: string; children?: ReactNode }) {
  const label = useContext(TabsLabelContext);
  return (
    <TabsList aria-label={label} className={className}>
      {children}
    </TabsList>
  );
}

export const Tabs = Object.assign(TabsRoot, {
  TriggersList: TabsTriggersList,
  Trigger: TabsTrigger,
  Content: TabsContent,
});
