import React from 'react';
import { Input } from '../../ui/Input.tsx';
import { Label } from '../../ui/Label.tsx';
import { cn } from '~/utils/';

function InputWithLabel({ value, onChange, label, id }) {
  const defaultTextProps =
    'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-400 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  return (
    <>
      <Label
        htmlFor={id}
        className="text-left text-sm font-medium"
      >
        {label}
        <br />
      </Label>

      <Input
        id={id}
        value={value || ''}
        onChange={onChange}
        placeholder={`Enter ${label}`}
        className={cn(
          defaultTextProps,
          'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
        )}
      />
    </>
  );
}

export default InputWithLabel;
