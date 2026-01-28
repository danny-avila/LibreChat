import { useState, useEffect } from 'react';
import { Input } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { Info } from 'lucide-react';

const MAX_LENGTH = 120;

const Description = ({
  initialValue,
  onValueChange,
  disabled,
  tabIndex,
}: {
  initialValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  tabIndex?: number;
}) => {
  const localize = useLocalize();
  const [description, setDescription] = useState(initialValue || '');
  const [charCount, setCharCount] = useState(initialValue?.length || 0);

  useEffect(() => {
    setDescription(initialValue || '');
    setCharCount(initialValue?.length || 0);
  }, [initialValue]);

  useEffect(() => {
    setCharCount(description.length);
  }, [description]);

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (e.target.value.length <= MAX_LENGTH) {
      setDescription(e.target.value);
      onValueChange?.(e.target.value);
    }
  };

  if (disabled && !description) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-light shadow-md">
      <label
        htmlFor="prompt-description"
        className="block px-4 pt-2 text-sm text-text-secondary md:hidden"
      >
        {localize('com_ui_description_placeholder')}
      </label>
      <div className="relative flex h-10 items-center gap-1 pl-4 pr-2 text-sm text-text-secondary">
        <Info className="icon-sm shrink-0" aria-hidden="true" />
        <div className="relative min-w-0 flex-1">
          <Input
            type="text"
            id="prompt-description"
            tabIndex={tabIndex}
            disabled={disabled}
            placeholder=" "
            value={description}
            onChange={handleInputChange}
            className="peer w-full border-none pr-14"
            aria-label={localize('com_ui_description_placeholder')}
          />
          <label
            htmlFor="prompt-description"
            className="pointer-events-none absolute left-0 top-0.5 hidden max-w-[calc(100%-3.5rem)] origin-[0] translate-y-2 scale-100 rounded bg-white px-1 text-sm text-text-secondary transition-transform duration-200 peer-placeholder-shown:translate-y-2 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-text-primary peer-[:not(:placeholder-shown)]:-translate-y-3 peer-[:not(:placeholder-shown)]:scale-75 dark:bg-gray-850 md:block"
          >
            {localize('com_ui_description_placeholder')}
          </label>
        </div>
        {!disabled && (
          <span className="absolute right-2 shrink-0 text-xs text-text-secondary md:text-sm">{`${charCount}/${MAX_LENGTH}`}</span>
        )}
      </div>
    </div>
  );
};

export default Description;
