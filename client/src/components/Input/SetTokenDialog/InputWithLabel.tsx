import React, { ChangeEvent, FC } from 'react';
import { Input, Label } from '~/components';
import { cn, defaultTextPropsLabel, removeFocusOutlines } from '~/utils/';

interface InputWithLabelProps {
  value: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  label: string;
  id: string;
}

const InputWithLabel: FC<InputWithLabelProps> = ({ value, onChange, label, id }) => {
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
        placeholder={`Enter ${label}`}
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
