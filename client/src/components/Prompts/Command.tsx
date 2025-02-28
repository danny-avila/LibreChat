import { SquareSlash } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useState, useEffect } from 'react';
import { Input } from '~/components/ui';
import { useLocalize } from '~/hooks';

const Command = ({
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
  const [command, setCommand] = useState(initialValue || '');
  const [charCount, setCharCount] = useState(initialValue?.length || 0);

  useEffect(() => {
    setCommand(initialValue || '');
    setCharCount(initialValue?.length || 0);
  }, [initialValue]);

  useEffect(() => {
    setCharCount(command.length);
  }, [command]);

  const handleInputChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    let newValue = e.target.value.toLowerCase();

    newValue = newValue.replace(/\s/g, '-').replace(/[^a-z0-9-]/g, '');

    if (newValue.length <= Constants.COMMANDS_MAX_LENGTH) {
      setCommand(newValue);
      onValueChange?.(newValue);
    }
  };

  if (disabled === true && !command) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border-light shadow-md">
      <h3 className="flex h-10 items-center gap-1 pl-4 text-sm text-text-secondary">
        <SquareSlash className="icon-sm" aria-hidden="true" />
        <Input
          type="text"
          tabIndex={tabIndex}
          disabled={disabled}
          placeholder={localize('com_ui_command_placeholder')}
          value={command}
          onChange={handleInputChange}
          className="border-none"
        />
        {disabled !== true && (
          <span className="mr-4 w-10 text-xs text-text-secondary md:text-sm">{`${charCount}/${Constants.COMMANDS_MAX_LENGTH}`}</span>
        )}
      </h3>
    </div>
  );
};

export default Command;
