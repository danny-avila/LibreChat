import { useState, useEffect } from 'react';
import { Info } from 'lucide-react';
import { useLocalize } from '~/hooks';

const MAX_LENGTH = 56;

const Description = ({
  initialValue,
  onValueChange,
  disabled,
}: {
  initialValue?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
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
    <div className="rounded-lg border border-border-medium">
      <h3 className="flex h-10 items-center gap-2 pl-4 text-sm text-text-secondary">
        <Info className="icon-sm" />
        <input
          type="text"
          disabled={disabled}
          placeholder={localize('com_ui_description_placeholder')}
          value={description}
          onChange={handleInputChange}
          className="w-full rounded-lg border-none bg-transparent p-1 text-text-primary placeholder:text-text-tertiary placeholder:underline placeholder:underline-offset-2 focus:bg-surface-tertiary focus:outline-none focus:ring-0 md:w-96"
        />
        {!disabled && (
          <span className="mr-1 w-10 text-xs text-text-tertiary md:text-sm">{`${charCount}/${MAX_LENGTH}`}</span>
        )}
      </h3>
    </div>
  );
};

export default Description;
