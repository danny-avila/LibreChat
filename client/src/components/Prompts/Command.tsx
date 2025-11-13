import { Input } from '@librechat/client';
import { SquareSlash } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import { useState, useEffect } from 'react';
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
      <label
        htmlFor="prompt-command"
        className="block px-4 pt-2 text-sm text-text-secondary md:hidden"
      >
        {localize('com_ui_command_placeholder')}
      </label>
      <div className="relative flex h-10 items-center gap-1 pl-4 pr-2 text-sm text-text-secondary">
        <SquareSlash className="icon-sm shrink-0" aria-hidden="true" />
        <div className="relative min-w-0 flex-1">
          <Input
            type="text"
            id="prompt-command"
            tabIndex={tabIndex}
            disabled={disabled}
            placeholder=" "
            value={command}
            onChange={handleInputChange}
            className="peer w-full border-none pr-14"
            aria-label={localize('com_ui_command_placeholder')}
          />
          <label
            htmlFor="prompt-command"
            className="pointer-events-none absolute left-0 top-0.5 hidden max-w-[calc(100%-3.5rem)] origin-[0] translate-y-2 scale-100 rounded bg-white px-1 text-sm text-text-secondary transition-transform duration-200 peer-placeholder-shown:translate-y-2 peer-placeholder-shown:scale-100 peer-focus:-translate-y-3 peer-focus:scale-75 peer-focus:text-text-primary peer-[:not(:placeholder-shown)]:-translate-y-3 peer-[:not(:placeholder-shown)]:scale-75 dark:bg-gray-850 md:block"
          >
            {localize('com_ui_command_placeholder')}
          </label>
        </div>
        {disabled !== true && (
          <span className="absolute right-2 shrink-0 text-xs text-text-secondary md:text-sm">{`${charCount}/${Constants.COMMANDS_MAX_LENGTH}`}</span>
        )}
      </div>
    </div>
  );
};

export default Command;
