import React, { useState, useRef, useLayoutEffect, useCallback, memo } from 'react';
import { useLocalize } from '~/hooks';

interface Option {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

interface RadioProps {
  options: Option[];
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  className?: string;
  buttonClassName?: string;
  fullWidth?: boolean;
  'aria-labelledby'?: string;
}

const Radio: React.NamedExoticComponent<RadioProps> = memo(function Radio({
  options,
  value,
  onChange,
  disabled = false,
  className = '',
  buttonClassName = '',
  fullWidth = false,
  'aria-labelledby': ariaLabelledBy,
}: RadioProps) {
  const localize = useLocalize();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const [currentValue, setCurrentValue] = useState<string>(value ?? '');
  const [backgroundStyle, setBackgroundStyle] = useState<React.CSSProperties>({});

  const handleChange = (newValue: string) => {
    setCurrentValue(newValue);
    onChange?.(newValue);
  };

  const updateBackgroundStyle = useCallback(() => {
    const selectedIndex = options.findIndex((opt) => opt.value === currentValue);
    const selectedButton = buttonRefs.current[selectedIndex];
    if (selectedIndex < 0 || !selectedButton) {
      return;
    }
    // offsetWidth/offsetLeft are layout metrics: unlike getBoundingClientRect they
    // are not distorted by the dialog's open transform (scale), and they resolve to
    // whole pixels, so the indicator matches its segment and keeps crisp borders.
    setBackgroundStyle({
      width: `${selectedButton.offsetWidth}px`,
      transform: `translateX(${selectedButton.offsetLeft}px)`,
    });
  }, [currentValue, options]);

  // Measure before paint and re-measure on any later layout change (the dialog's
  // open animation settling, a window resize). A fixed timeout previously raced
  // the dialog transition and left the indicator mis-sized.
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    updateBackgroundStyle();
    setIsMounted(true);
    const observer = new ResizeObserver(() => updateBackgroundStyle());
    observer.observe(container);
    return () => observer.disconnect();
  }, [updateBackgroundStyle]);

  useLayoutEffect(() => {
    if (value !== undefined) {
      setCurrentValue(value);
    }
  }, [value]);

  if (options.length === 0) {
    return (
      <div
        className="relative inline-flex items-center rounded-lg bg-muted p-1 opacity-50"
        role="radiogroup"
        aria-labelledby={ariaLabelledBy}
      >
        <span className="px-4 py-2 text-xs text-muted-foreground">
          {localize('com_ui_no_options')}
        </span>
      </div>
    );
  }

  const selectedIndex = options.findIndex((opt) => opt.value === currentValue);

  return (
    <div
      ref={containerRef}
      className={`relative ${fullWidth ? 'flex' : 'inline-flex'} items-center rounded-lg bg-muted px-1 ${className}`}
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
    >
      {selectedIndex >= 0 && isMounted && (
        <div
          className="pointer-events-none absolute inset-y-1 left-0 rounded-md border border-border bg-background shadow-sm transition-all duration-300 ease-out"
          style={backgroundStyle}
        />
      )}
      {options.map((option, index) => (
        <button
          key={option.value}
          ref={(el) => {
            buttonRefs.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={currentValue === option.value}
          onClick={() => handleChange(option.value)}
          disabled={disabled}
          className={`relative z-10 flex h-[34px] items-center justify-center gap-2 rounded-md px-4 text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            currentValue === option.value ? 'text-text-primary' : 'text-text-secondary'
          } ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${fullWidth ? 'flex-1' : ''} ${buttonClassName}`}
        >
          {option.icon && (
            <span className="flex-shrink-0" aria-hidden="true">
              {option.icon}
            </span>
          )}
          <span className="whitespace-nowrap">{option.label}</span>
        </button>
      ))}
    </div>
  );
});

export default Radio;
