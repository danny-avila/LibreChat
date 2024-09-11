import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useLocalize } from '~/hooks';
import { Minus, Plus } from 'lucide-react';

interface ModelParametersProps {
  label?: string;
  ariaLabel?: string;
  min?: number;
  max?: number;
  step?: number;
  stepClick?: number;
  initialValue?: number;
  showButtons?: boolean;
  onChange?: (value: number) => void;
  disabled?: boolean;
}

const ModelParameters: React.FC<ModelParametersProps> = ({
  label = 'Value',
  ariaLabel = 'Value',
  min = 0,
  max = 100,
  step = 1,
  stepClick = 1,
  initialValue = 0,
  showButtons = true,
  onChange,
  disabled = false,
}) => {
  const localize = useLocalize();
  const [value, setValue] = useState(initialValue);
  const [isHovering, setIsHovering] = useState(false);
  const rangeRef = useRef<HTMLInputElement>(null);

  const id = `model-parameter-${ariaLabel.toLowerCase().replace(/\s+/g, '-')}`;
  const displayLabel = label.startsWith('com_') ? localize(label) : label;

  const getDecimalPlaces = (num: number) => {
    const match = ('' + num).match(/(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/);
    if (!match) {
      return 0;
    }
    return Math.max(0, (match[1] ? match[1].length : 0) - (match[2] ? +match[2] : 0));
  };

  const decimalPlaces = getDecimalPlaces(step);

  const handleChange = useCallback(
    (newValue: number) => {
      const clampedValue = Math.min(Math.max(newValue, min), max);
      const finalValue = Object.is(clampedValue, -0) ? 0 : clampedValue;
      setValue(finalValue);
      onChange?.(finalValue);
    },
    [min, max, onChange],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleChange(parseFloat(e.target.value));
    },
    [handleChange],
  );

  const handleIncrement = useCallback(() => {
    handleChange(value + stepClick);
  }, [value, stepClick, handleChange]);

  const handleDecrement = useCallback(() => {
    handleChange(value - stepClick);
  }, [value, stepClick, handleChange]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        handleIncrement();
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleDecrement();
      }
    },
    [handleIncrement, handleDecrement],
  );

  useEffect(() => {
    const rangeElement = rangeRef.current;
    if (rangeElement) {
      const percentage = ((value - min) / (max - min)) * 100;
      rangeElement.style.backgroundSize = `${percentage}% 100%`;
    }
  }, [value, min, max]);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center justify-between">
        <label
          htmlFor={id}
          className={`text-sm font-medium ${disabled ? 'text-gray-400 dark:text-gray-400' : ''}`}
        >
          {displayLabel}
        </label>
        <div className="flex items-center gap-2">
          <output
            htmlFor={id}
            className={`select-none text-sm font-medium ${
              disabled ? 'text-gray-400 dark:text-gray-400' : ''
            }`}
            aria-live="polite"
          >
            {value.toFixed(decimalPlaces).replace('-0.00', '0.00')}
          </output>
          {showButtons && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDecrement}
                className={`rounded-md p-1 transition-colors ${
                  disabled
                    ? 'cursor-not-allowed text-gray-400 dark:text-gray-400'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label={`Decrease ${label}`}
                disabled={disabled}
              >
                <Minus size={16} />
              </button>
              <button
                type="button"
                onClick={handleIncrement}
                className={`rounded-md p-1 transition-colors ${
                  disabled
                    ? 'cursor-not-allowed text-gray-400 dark:text-gray-400'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-700'
                }`}
                aria-label={`Increase ${label}`}
                disabled={disabled}
              >
                <Plus size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="relative w-full">
        <input
          ref={rangeRef}
          type="range"
          id={id}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onMouseEnter={() => setIsHovering(true)}
          onMouseLeave={() => setIsHovering(false)}
          className={`slider-thumb h-2 w-full appearance-none rounded-lg bg-gradient-to-r from-gray-500 to-gray-500 bg-no-repeat focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
            disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
          }`}
          tabIndex={0}
          style={{
            backgroundSize: '50% 100%',
            backgroundPosition: 'left',
          }}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={`${value.toFixed(decimalPlaces).replace('-0.00', '0.00')}`}
          disabled={disabled}
        />
        {isHovering ? (
          <div className="trab mt-1 flex justify-between">
            <span className="text-xs text-gray-500">{min}</span>
            <span className="text-xs text-gray-500">{max}</span>
          </div>
        ) : (
          <div className="mt-1" style={{ height: '1rem' }}></div>
        )}
      </div>
    </div>
  );
};

export default React.memo(ModelParameters);
