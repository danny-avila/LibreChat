import * as React from 'react';
import { cn } from '../../utils';

export type InputWithDropdownProps = React.InputHTMLAttributes<HTMLInputElement> & {
  options: string[];
  onSelect?: (value: string) => void;
};

const InputWithDropdown = React.forwardRef<HTMLInputElement, InputWithDropdownProps>(
  ({ className, options, onSelect, ...props }, ref) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const [inputValue, setInputValue] = React.useState((props.value as string) || '');
    const [highlightedIndex, setHighlightedIndex] = React.useState(-1);
    const inputRef = React.useRef<HTMLInputElement>(null);

    const handleSelect = (value: string) => {
      setInputValue(value);
      setIsOpen(false);
      setHighlightedIndex(-1);
      if (onSelect) {
        onSelect(value);
      }
      if (props.onChange) {
        props.onChange({ target: { value } } as React.ChangeEvent<HTMLInputElement>);
      }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setInputValue(e.target.value);
      if (props.onChange) {
        props.onChange(e);
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prevIndex) =>
              prevIndex < options.length - 1 ? prevIndex + 1 : prevIndex,
            );
          }
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prevIndex) => (prevIndex > 0 ? prevIndex - 1 : 0));
          break;
        case 'Enter':
          e.preventDefault();
          if (isOpen && highlightedIndex !== -1) {
            handleSelect(options[highlightedIndex]);
          }
          setIsOpen(false);
          break;
        case 'Escape':
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;
      }
    };

    React.useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
          setIsOpen(false);
          setHighlightedIndex(-1);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }, []);

    return (
      <div className="relative" ref={inputRef}>
        <div className="relative">
          <input
            {...props}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            aria-haspopup="listbox"
            aria-controls="dropdown-list"
            className={cn(
              'flex h-10 w-full rounded-md border border-gray-300 bg-transparent px-3 py-2 pr-10 text-sm placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:text-gray-50',
              className ?? '',
            )}
            ref={ref}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-0 flex items-center px-2 text-gray-400 hover:text-gray-600"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close dropdown' : 'Open dropdown'}
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
        {isOpen && (
          <ul
            id="dropdown-list"
            role="listbox"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-300 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
          >
            {options.map((option, index) => (
              <li
                key={index}
                role="option"
                aria-selected={index === highlightedIndex}
                className={cn(
                  'cursor-pointer px-3 py-2',
                  index === highlightedIndex
                    ? 'bg-blue-100 dark:bg-blue-700'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700',
                )}
                onClick={() => handleSelect(option)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleSelect(option);
                  }
                }}
                tabIndex={0}
              >
                {option}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

InputWithDropdown.displayName = 'InputWithDropdown';

export default InputWithDropdown;
