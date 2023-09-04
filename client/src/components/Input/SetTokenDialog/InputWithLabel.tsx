import React, { ChangeEvent, FC } from 'react';
import { Input, Label } from '~/components';
import { cn, defaultTextPropsLabel, removeFocusOutlines } from '~/utils/';
import { useLocalize } from '~/hooks';

interface InputWithLabelProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
  id: string;
}

const InputWithLabel: FC<InputWithLabelProps> = ({ value, onChange, label, id }) => {
  const localize = useLocalize();
  return (
    <>
      <Label htmlFor={id} className="text-left text-sm font-medium">
        {label}
        <br />
      </Label>

      <Input
        id={id}
        value={value || ''}
        onChange={onChange}
        placeholder={`${localize('com_ui_enter')} ${label}`}
        className={cn(
          defaultTextPropsLabel,
          'flex h-10 max-h-10 w-full resize-none px-3 py-2',
          removeFocusOutlines,
        )}
      />
    </>
  );
};

export default InputWithLabel;
