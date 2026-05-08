import { useState, useRef, useEffect } from 'react';

interface SearchableMultiSelectProps {
  options: string[];
  value: string[]; // selected values
  onChange: (selected: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableMultiSelect = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
}: SearchableMultiSelectProps) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // filter options based on search term
  const filtered = options.filter((o) =>
    o.toLowerCase().includes(search.toLowerCase())
  );

  // determine which options to show: if searching show all filtered, else limit to 10
  const displayOptions = search ? filtered : filtered.slice(0, 10);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => inputRef.current?.focus(), 0);
      } else {
        setSearch('');
      }
      return next;
    });
  };

  const toggleOption = (opt: string) => {
    let newSelected: string[];
    if (value.includes(opt)) {
      newSelected = value.filter((v) => v !== opt);
    } else {
      newSelected = [...value, opt];
    }
    onChange(newSelected);
  };

  const selectedDisplay = value.length ? value.join(', ') : '';

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`flex w-full items-center justify-between rounded-md border border-border-heavy bg-surface-secondary px-3 py-2 text-left text-sm focus:outline-none focus:ring-1 focus:ring-green-500 disabled:cursor-not-allowed disabled:opacity-50 ${
          selectedDisplay ? 'text-text-primary' : 'text-text-secondary'
        }`}
      >
        <span className="truncate">{selectedDisplay || placeholder}</span>
        <svg
          className={`ml-2 h-4 w-4 shrink-0 text-text-secondary transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-[300] mt-1 w-full rounded-md border border-border-heavy bg-surface-primary shadow-lg">
          <div className="border-b border-border-heavy p-2">
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full rounded border border-border-heavy bg-surface-secondary px-2 py-1.5 text-sm text-text-primary placeholder-text-secondary focus:outline-none focus:ring-1 focus:ring-green-500"
            />
          </div>
          <ul className="max-h-52 overflow-y-auto py-1">
            {displayOptions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-text-secondary">No results found</li>
            ) : (
              displayOptions.map((opt) => (
                <li
                  key={opt}
                  onMouseDown={() => toggleOption(opt)}
                  className={`cursor-pointer px-3 py-2 text-sm hover:bg-surface-active ${
                    value.includes(opt)
                      ? 'bg-green-50 font-medium text-green-700 dark:bg-green-900/20 dark:text-green-400'
                      : 'text-text-primary'
                  }`}
                >
                  {opt}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SearchableMultiSelect;
