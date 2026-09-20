import { useMemo, useState, useRef, memo, useEffect, forwardRef, useCallback } from 'react';
import * as Ariakit from '@ariakit/react';
import { matchSorter } from 'match-sorter';
import { Search, ChevronDown } from 'lucide-react';
import { SelectRenderer } from '@ariakit/react-components/select/select-renderer';
import type {
  ForwardedRef,
  ForwardRefExoticComponent,
  MemoExoticComponent,
  RefAttributes,
} from 'react';
import type { OptionWithIcon } from '~/common';
import { usePopoverZIndex } from './OriginalDialog';
import { fieldControl } from './Field';
import { Button } from './Button';
import './AnimatePopover.css';
import { cn } from '~/utils';

interface ControlComboboxProps {
  selectedValue: string;
  displayValue?: string;
  items: OptionWithIcon[];
  setValue: (value: string) => void;
  onBlur?: React.FocusEventHandler<HTMLButtonElement>;
  ariaLabel: string;
  ariaInvalid?: boolean;
  ariaDescribedBy?: string;
  searchPlaceholder?: string;
  selectPlaceholder?: string;
  isCollapsed: boolean;
  SelectIcon?: React.ReactNode;
  containerClassName?: string;
  iconClassName?: string;
  showCarat?: boolean;
  className?: string;
  disabled?: boolean;
  iconSide?: 'left' | 'right';
  selectId?: string;
  placement?: Ariakit.SelectStoreProps['placement'];
  popoverClassName?: string;
  matchTriggerWidth?: boolean;
  /** `field` matches the `Input` primitive so this can sit in a form row. */
  variant?: 'default' | 'field';
  gutter?: number;
  /**
   * Radix dialogs trap focus, so a portaled popover rendered outside the dialog
   * cannot receive typing in its search field. Pass `false` from inside a dialog
   * to keep the list in the dialog, and give that dialog `overflow-visible` so
   * the popover is not clipped.
   */
  portal?: boolean;
  /** Told when the popover opens and closes, for hosts that must behave
   *  differently while it is up — e.g. a focus-trapped panel whose own Escape
   *  handler must not fire while an open popover owns the key. */
  onOpenChange?: (open: boolean) => void;
  /** Independent actions stay outside listbox options, including disabled options.
   * Reach actions with Tab from the search input. Key-required rows should set
   * activateOnSelect so Enter on the option also opens setup. */
  optionAction?: (value: string) =>
    | {
        label: string;
        icon: React.ReactNode;
        onClick: () => void;
        /** Lets setup entries open their action without changing the selected value. */
        activateOnSelect?: boolean;
      }
    | undefined;
}

const ROW_HEIGHT = 36;

/** The ref reaches the trigger button, so a host can focus or open the control without
 *  looking it up in the document. */
const ControlCombobox: ForwardRefExoticComponent<
  ControlComboboxProps & RefAttributes<HTMLButtonElement>
> = forwardRef(function ControlCombobox(
  {
    selectedValue,
    displayValue,
    items,
    setValue,
    onBlur,
    ariaLabel,
    ariaInvalid,
    ariaDescribedBy,
    searchPlaceholder,
    selectPlaceholder,
    containerClassName,
    isCollapsed,
    SelectIcon,
    showCarat,
    className,
    disabled,
    iconClassName,
    iconSide = 'left',
    selectId,
    placement,
    popoverClassName,
    matchTriggerWidth = true,
    variant = 'default',
    gutter = 4,
    portal = true,
    onOpenChange,
    optionAction,
  }: ControlComboboxProps,
  ref: ForwardedRef<HTMLButtonElement>,
) {
  const [searchValue, setSearchValue] = useState('');
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const setButtonRef = useCallback(
    (node: HTMLButtonElement | null) => {
      buttonRef.current = node;
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );
  const openingAction = useRef(false);
  const [buttonWidth, setButtonWidth] = useState<number | null>(null);
  const popoverZIndex = usePopoverZIndex();

  const getItem = (option: OptionWithIcon) => ({
    id: `item-${option.value}`,
    value: option.value as string | undefined,
    label: option.label,
    icon: option.icon,
    disabled: option.disabled,
    description: option.description,
  });

  const combobox = Ariakit.useComboboxStore({
    defaultItems: items.map(getItem),
    resetValueOnHide: true,
    value: searchValue,
    setValue: setSearchValue,
  });

  const select = Ariakit.useSelectStore({
    combobox,
    defaultItems: items.map(getItem),
    value: selectedValue,
    setValue: (value) => {
      const action = optionAction?.(value);
      if (action?.activateOnSelect) {
        openingAction.current = true;
        action.onClick();
        return;
      }
      setValue(value);
    },
    setOpen: onOpenChange,
    placement,
  });
  const isOpen = Ariakit.useStoreState(select, 'open');
  useEffect(() => {
    if (isOpen) openingAction.current = false;
  }, [isOpen]);

  const handleEscape = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape' || event.nativeEvent.isComposing || !select.getState().open) {
      return;
    }
    // Radix dialogs prevent Escape during capture to keep themselves open. Ariakit
    // then skips its default dismissal, so the focused control closes its own menu.
    event.preventDefault();
    event.stopPropagation();
    select.hide();
    buttonRef.current?.focus();
  };

  const matches = useMemo(() => {
    const filteredItems = matchSorter(items, searchValue, {
      keys: ['value', 'label'],
      baseSort: (a, b) => (a.index < b.index ? -1 : 1),
    });
    return filteredItems.map(getItem);
  }, [searchValue, items]);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button || isCollapsed) {
      return;
    }

    setButtonWidth(button.offsetWidth);

    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = entry.borderBoxSize?.[0]?.inlineSize ?? button.offsetWidth;
      if (width > 0) {
        setButtonWidth(width);
      }
    });

    observer.observe(button);
    return () => observer.disconnect();
  }, [isCollapsed]);

  const selectIconClassName = cn(
    'flex h-5 w-5 items-center justify-center overflow-hidden rounded-full',
    iconClassName,
  );
  const optionIconClassName = cn(
    'mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full',
    iconClassName,
  );

  return (
    <div
      className={cn(
        'flex w-full items-center justify-center px-1',
        variant === 'field' && 'px-0',
        containerClassName,
      )}
    >
      <Ariakit.SelectLabel store={select} className="sr-only">
        {ariaLabel}
      </Ariakit.SelectLabel>
      <Ariakit.Select
        ref={setButtonRef}
        store={select}
        id={selectId}
        disabled={disabled}
        onBlur={onBlur}
        onKeyDown={handleEscape}
        aria-invalid={ariaInvalid || undefined}
        aria-describedby={ariaDescribedBy}
        className={cn(
          'flex items-center justify-center gap-2 rounded-full bg-surface-secondary',
          'text-text-primary hover:bg-surface-tertiary',
          'border border-border-light',
          isCollapsed ? 'h-9 w-9' : 'h-9 w-full rounded-xl px-3 py-2 text-sm',
          variant === 'field' && cn(fieldControl, 'justify-start hover:bg-surface-hover'),
          className,
        )}
      >
        {SelectIcon != null && iconSide === 'left' && (
          <div className={selectIconClassName}>{SelectIcon}</div>
        )}
        {!isCollapsed && (
          <>
            <span
              className="flex-grow truncate text-left"
              title={(displayValue != null ? displayValue : selectedValue) || undefined}
            >
              {displayValue != null
                ? displayValue || selectPlaceholder
                : selectedValue || selectPlaceholder}
            </span>
            {SelectIcon != null && iconSide === 'right' && (
              <div className={selectIconClassName}>{SelectIcon}</div>
            )}
            {showCarat && <ChevronDown className="h-4 w-4 text-text-secondary" />}
          </>
        )}
      </Ariakit.Select>
      <Ariakit.SelectPopover
        store={select}
        gutter={gutter}
        portal={portal}
        finalFocus={buttonRef}
        hideOnEscape={false}
        autoFocusOnHide={() => !openingAction.current}
        onKeyDown={handleEscape}
        className={cn(
          'overflow-hidden rounded-xl border border-border-light bg-surface-secondary shadow-lg',
          popoverClassName ?? 'animate-popover',
        )}
        style={{
          zIndex: popoverZIndex,
          ...(matchTriggerWidth
            ? { width: isCollapsed ? '300px' : (buttonWidth ?? '300px') }
            : { minWidth: '16rem' }),
        }}
      >
        <div className="py-1.5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-primary" />
            <Ariakit.Combobox
              store={combobox}
              onKeyDown={handleEscape}
              autoSelect
              placeholder={searchPlaceholder}
              className="w-full rounded-md bg-surface-secondary py-2 pl-9 pr-3 text-sm text-text-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="relative max-h-[300px] overflow-auto">
          <Ariakit.ComboboxList store={combobox}>
            <SelectRenderer
              store={select}
              items={matches}
              itemSize={ROW_HEIGHT}
              overscan={5}
              persistentIndices={matches.length ? [0, matches.length - 1] : []}
            >
              {({ value, icon, label, description, disabled: itemDisabled, ...item }) => (
                <Ariakit.ComboboxItem
                  key={item.id}
                  {...item}
                  disabled={itemDisabled}
                  title={description}
                  aria-describedby={description ? `${item.id}-description` : undefined}
                  className={cn(
                    'flex w-full cursor-pointer items-center px-3 text-sm',
                    'text-text-primary hover:bg-surface-tertiary',
                    'data-[active-item]:bg-surface-tertiary',
                    'aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
                    value && optionAction?.(value) && 'pr-12',
                  )}
                  render={<Ariakit.SelectItem value={value} disabled={itemDisabled} />}
                >
                  {icon != null && iconSide === 'left' && (
                    <div className={optionIconClassName}>{icon}</div>
                  )}
                  <span className="flex-grow truncate text-left">{label}</span>
                  {icon != null && iconSide === 'right' && (
                    <div className={optionIconClassName}>{icon}</div>
                  )}
                </Ariakit.ComboboxItem>
              )}
            </SelectRenderer>
          </Ariakit.ComboboxList>
          {matches.some((item) => item.description) && (
            <div className="sr-only">
              {matches.map(
                (item) =>
                  item.description && (
                    <span key={item.id} id={`${item.id}-description`}>
                      {item.description}
                    </span>
                  ),
              )}
            </div>
          )}
          {optionAction && (
            <div className="absolute right-1 top-0">
              {matches.map((item, index) => {
                const action = item.value ? optionAction(item.value) : undefined;
                if (!action) return null;
                return (
                  <div
                    key={item.id}
                    className="absolute right-0 flex items-center"
                    style={{ height: ROW_HEIGHT, top: index * ROW_HEIGHT }}
                  >
                    {action && (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={action.label}
                        title={action.label}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          openingAction.current = true;
                          select.hide();
                          action.onClick();
                        }}
                      >
                        {action.icon}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Ariakit.SelectPopover>
    </div>
  );
});

const ControlComboboxMemo: MemoExoticComponent<typeof ControlCombobox> = memo(ControlCombobox);
export default ControlComboboxMemo;
