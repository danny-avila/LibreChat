import { forwardRef, useId } from 'react';
import {
  Input,
  Label,
  Button as AppButton,
  Switch as AppSwitch,
  Spinner,
  Checkbox as AppCheckbox,
  disabledInkClasses,
} from '@librechat/client';
import type {
  ReactNode,
  ChangeEvent,
  ComponentProps,
  FocusEventHandler,
  KeyboardEventHandler,
  ClipboardEventHandler,
  InputHTMLAttributes,
  MouseEventHandler,
} from 'react';
import type { IconName } from './Icon';
import { Icon } from './Icon';
import { cn } from '~/utils';

/**
 * The click-ui form controls the admin panel was written with, rebuilt on SassyChat's own
 * primitives so the panel follows SassyChat's themes. Each keeps the click-ui call shape the
 * panel uses (a text field reports its value, a button group the chosen option).
 */

type AppButtonProps = ComponentProps<typeof AppButton>;

const BUTTON_VARIANTS: Record<string, AppButtonProps['variant']> = {
  primary: 'default',
  secondary: 'outline',
  empty: 'ghost',
  danger: 'destructive',
};

export interface ButtonProps {
  type?: 'primary' | 'secondary' | 'empty' | 'danger';
  htmlType?: 'button' | 'submit' | 'reset';
  label?: ReactNode;
  iconLeft?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  fillWidth?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  className?: string;
  children?: ReactNode;
  id?: string;
  'aria-label'?: string;
  'aria-disabled'?: boolean | 'true' | 'false';
  'aria-pressed'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
  'aria-controls'?: string;
  'aria-expanded'?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    type = 'primary',
    htmlType = 'button',
    label,
    iconLeft,
    iconRight,
    loading,
    disabled,
    fillWidth,
    className,
    children,
    ...props
  },
  ref,
) {
  return (
    <AppButton
      ref={ref}
      type={htmlType}
      variant={BUTTON_VARIANTS[type] ?? 'default'}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(fillWidth && 'w-full', className)}
      {...props}
    >
      {loading ? (
        <Spinner className="size-4" />
      ) : (
        iconLeft && <Icon name={iconLeft} size="sm" aria-hidden />
      )}
      {label ?? children}
      {iconRight && !loading && <Icon name={iconRight} size="sm" aria-hidden />}
    </AppButton>
  );
});

export interface ButtonGroupOption {
  label: ReactNode;
  value: string;
  disabled?: boolean;
  title?: string;
  'aria-label'?: string;
}

export interface ButtonGroupProps {
  options: ButtonGroupOption[];
  selected?: string;
  onClick?: (value: string) => void;
  onChange?: (value: string) => void;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  [key: `data-${string}`]: string | undefined;
}

/** A row of mutually exclusive choices; the chosen one is pressed. */
export function ButtonGroup({
  options,
  selected,
  onClick,
  onChange,
  className,
  ...props
}: ButtonGroupProps) {
  return (
    <div
      role="group"
      className={cn(
        'border-border-light inline-flex max-w-full overflow-hidden rounded-lg border',
        className,
      )}
      {...props}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            aria-label={option['aria-label']}
            title={option.title}
            disabled={option.disabled}
            onClick={() => {
              onClick?.(option.value);
              onChange?.(option.value);
            }}
            className={cn(
              'border-border-light focus-visible:ring-focus-control px-3 py-1.5 text-sm whitespace-nowrap transition-colors not-first:border-l focus-visible:ring-2 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none',
              disabledInkClasses,
              active
                ? 'bg-surface-active-alt text-text-primary font-medium'
                : 'text-text-secondary hover:bg-surface-hover bg-transparent',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

type NativeInput = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'value' | 'type' | 'size'
>;

export interface TextFieldProps extends NativeInput {
  label?: ReactNode;
  value?: string;
  type?: 'text' | 'email' | 'password' | 'url' | 'search' | 'number' | 'tel';
  /** Click-ui reports the new value first, then the event. */
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  /** A message shows under the field; `true` only marks it invalid. */
  error?: ReactNode | boolean;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  onPaste?: ClipboardEventHandler<HTMLInputElement>;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, id, value, type = 'text', onChange, error, className, ...props },
  ref,
) {
  const generated = useId();
  const inputId = id ?? generated;
  const errorId = `${inputId}-error`;
  const message = typeof error === 'boolean' ? undefined : error;
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label && (
        <Label htmlFor={inputId} className="text-sm font-medium">
          {label}
        </Label>
      )}
      <Input
        {...props}
        ref={ref}
        id={inputId}
        type={type}
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value, event)}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={
          [props['aria-describedby'], message ? errorId : undefined].filter(Boolean).join(' ') ||
          undefined
        }
      />
      {message && (
        <span id={errorId} role="alert" className="text-text-destructive text-xs">
          {message}
        </span>
      )}
    </div>
  );
});

export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, 'type'>>(
  function PasswordField(props, ref) {
    return <TextField ref={ref} type="password" {...props} />;
  },
);

export interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
}

/** A search box with its icon inside, drawn like SassyChat's settings search. */
export function SearchField({ value, onChange, className, ...props }: SearchFieldProps) {
  return (
    <div className={cn('relative w-full', className)}>
      <Icon
        name="search"
        size="sm"
        aria-hidden
        className="text-text-secondary pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-border-light bg-surface-primary text-text-primary placeholder:text-text-secondary focus-visible:ring-focus-control h-9 w-full rounded-lg border py-2 pr-3 pl-9 text-sm focus-visible:ring-2 focus-visible:outline-hidden"
        {...props}
      />
    </div>
  );
}

export interface NumberFieldProps {
  id?: string;
  /** The draft the field shows, as typed. */
  value?: string | number;
  onChange?: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  placeholder?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number | 'any';
  loading?: boolean;
  /** The panel hides the spin buttons; a native number input keeps the keyboard's. */
  hideControls?: boolean;
  /** A unit or other suffix drawn inside the field. */
  endContent?: ReactNode;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export function NumberField({
  value,
  onChange,
  endContent,
  hideControls: _hideControls,
  loading,
  ...props
}: NumberFieldProps) {
  return (
    <div className="flex w-full items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        value={value ?? ''}
        onChange={(event) => onChange?.(event.target.value)}
        aria-busy={loading || undefined}
        {...props}
      />
      {endContent && <span className="flex shrink-0 items-center">{endContent}</span>}
    </div>
  );
}

export interface SwitchProps {
  id?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-disabled'?: boolean | 'true' | 'false';
  'aria-describedby'?: string;
}

export function Switch(props: SwitchProps) {
  return <AppSwitch {...(props as ComponentProps<typeof AppSwitch>)} />;
}

export interface CheckboxProps {
  id?: string;
  label?: ReactNode;
  checked?: boolean | 'indeterminate';
  disabled?: boolean;
  onCheckedChange?: (checked: boolean | 'indeterminate') => void;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
}

/** A checkbox, with its label beside it when one is given. */
export function Checkbox({ id, label, className, ...props }: CheckboxProps) {
  const generated = useId();
  const checkboxId = id ?? generated;
  /* An unlabelled checkbox names itself through `aria-label`; one with a label is named by it. */
  const box = (
    <AppCheckbox {...({ id: checkboxId, ...props } as ComponentProps<typeof AppCheckbox>)} />
  );
  if (!label) {
    return box;
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {box}
      <Label htmlFor={checkboxId} className="text-sm">
        {label}
      </Label>
    </div>
  );
}

export interface DatePickerProps {
  date?: Date;
  onSelectDate: (date: Date) => void;
  placeholder?: string;
  'aria-label'?: string;
}

function toDateInputValue(date: Date | undefined): string {
  if (!date || Number.isNaN(date.getTime())) {
    return '';
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** A calendar date, through the browser's own date input. */
export function DatePicker({ date, onSelectDate, placeholder, ...props }: DatePickerProps) {
  return (
    <Input
      type="date"
      value={toDateInputValue(date)}
      placeholder={placeholder}
      aria-label={props['aria-label'] ?? placeholder}
      onChange={(event) => {
        const [year, month, day] = event.target.value.split('-').map(Number);
        if (year && month && day) {
          onSelectDate(new Date(year, month - 1, day));
        }
      }}
    />
  );
}
