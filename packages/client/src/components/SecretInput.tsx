import * as React from 'react';
import { useState, useCallback } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';
import { cn } from '~/utils';

export interface SecretInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Show copy button */
  showCopy?: boolean;
  /** Callback when value is copied */
  onCopy?: () => void;
  /** Duration in ms to show checkmark after copy (default: 2000) */
  copyFeedbackDuration?: number;
  label?: React.ReactNode;
  labelClassName?: string;
  containerClassName?: string;
  controlsClassName?: string;
  buttonClassName?: string;
  controlsOnHover?: boolean;
}

const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  (
    {
      id,
      label,
      className,
      showCopy = false,
      labelClassName,
      containerClassName,
      controlsClassName,
      buttonClassName,
      controlsOnHover = false,
      onCopy,
      copyFeedbackDuration = 2000,
      disabled,
      value,
      ...props
    },
    ref,
  ) => {
    const [isVisible, setIsVisible] = useState(false);
    const [isCopied, setIsCopied] = useState(false);

    const toggleVisibility = useCallback(() => {
      setIsVisible((prev) => !prev);
    }, []);

    const handleCopy = useCallback(async () => {
      if (isCopied || disabled) {
        return;
      }

      const textToCopy = typeof value === 'string' ? value : '';
      if (!textToCopy) {
        return;
      }

      try {
        await navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
        onCopy?.();

        setTimeout(() => {
          setIsCopied(false);
        }, copyFeedbackDuration);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }, [value, isCopied, disabled, onCopy, copyFeedbackDuration]);

    return (
      <div className={cn('group/secret-input relative flex items-center', containerClassName)}>
        <input
          id={id}
          type={isVisible ? 'text' : 'password'}
          className={cn(
            'flex h-10 w-full rounded-lg border border-border-light bg-transparent py-2 pl-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            className ?? '',
            showCopy ? 'pr-20' : 'pr-11',
          )}
          ref={ref}
          disabled={disabled}
          value={value}
          autoComplete="off"
          spellCheck={false}
          {...props}
        />
        {label != null && (
          <label htmlFor={id} className={cn(labelClassName ?? '')}>
            {label}
          </label>
        )}
        <div
          className={cn(
            'absolute inset-y-0 right-2 flex items-center gap-0.5',
            controlsOnHover &&
              'pointer-events-none opacity-0 transition-opacity duration-150 group-focus-within/secret-input:pointer-events-auto group-focus-within/secret-input:opacity-100 group-hover/secret-input:pointer-events-auto group-hover/secret-input:opacity-100',
            controlsClassName,
          )}
        >
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled || !value}
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
                disabled || !value ? 'cursor-not-allowed opacity-50' : 'hover:text-text-primary',
                buttonClassName,
              )}
              aria-label={isCopied ? 'Copied' : 'Copy to clipboard'}
            >
              {isCopied ? <Check className="size-4" /> : <Copy className="size-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={toggleVisibility}
            disabled={disabled}
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary',
              disabled ? 'cursor-not-allowed opacity-50' : 'hover:text-text-primary',
              buttonClassName,
            )}
            aria-label={isVisible ? 'Hide secret' : 'Show secret'}
          >
            {isVisible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
    );
  },
);

SecretInput.displayName = 'SecretInput';

export { SecretInput };
