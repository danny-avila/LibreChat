import { useState, useEffect } from 'react';
import { Input } from '~/components/ui';
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
      <h3 className="flex h-10 items-center gap-1 pl-4 text-sm text-text-secondary">
        <Info className="icon-sm" aria-hidden="true" />
        <Input
          type="text"
          tabIndex={tabIndex}
          disabled={disabled}
          placeholder={localize('com_ui_description_placeholder')}
          value={description}
          onChange={handleInputChange}
          className="border-none"
        />
        {!disabled && (
          <span className="mr-4 w-10 text-xs text-text-secondary md:text-sm">{`${charCount}/${MAX_LENGTH}`}</span>
        )}
      </h3>
    </div>
  );
};

export default Description;
