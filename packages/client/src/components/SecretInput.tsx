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
}

const SecretInput = React.forwardRef<HTMLInputElement, SecretInputProps>(
  (
    { className, showCopy = false, onCopy, copyFeedbackDuration = 2000, disabled, value, ...props },
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
      <div className="relative flex items-center">
        <input
          type={isVisible ? 'text' : 'password'}
          className={cn(
            'flex h-10 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
            showCopy ? 'pr-20' : 'pr-10',
            className ?? '',
          )}
          ref={ref}
          disabled={disabled}
          value={value}
          autoComplete="off"
          spellCheck={false}
          {...props}
        />
        <div className="absolute right-1 flex items-center gap-0.5">
          {showCopy && (
            <button
              type="button"
              onClick={handleCopy}
              disabled={disabled || !value}
              className={cn(
                'flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors',
                disabled || !value
                  ? 'cursor-not-allowed opacity-50'
                  : 'hover:bg-surface-hover hover:text-text-primary',
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
              'flex size-8 items-center justify-center rounded-md text-text-secondary transition-colors',
              disabled
                ? 'cursor-not-allowed opacity-50'
                : 'hover:bg-surface-hover hover:text-text-primary',
            )}
            aria-label={isVisible ? 'Hide password' : 'Show password'}
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
