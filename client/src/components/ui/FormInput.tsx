import React from 'react';
import { Label, Input } from '~/components/ui';
import { cn } from '~/utils';

export default function FormInput({
  field,
  label,
  labelClass,
  inputClass,
  containerClass,
  placeholder = '',
  type = 'string',
}: {
  field: any;
  label: string;
  labelClass?: string;
  inputClass?: string;
  placeholder?: string;
  containerClass?: string;
  type?: 'string' | 'number';
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    if (type !== 'number') {
      field.onChange(value);
      return;
    }

    if (value === '') {
      field.onChange(value);
    } else if (!isNaN(Number(value))) {
      field.onChange(Number(value));
    }
  };

  return (
    <div className={cn('flex w-full flex-col items-center gap-2', containerClass)}>
      <Label
        htmlFor={`${field.name}-input`}
        className={cn('text-left text-sm font-semibold text-text-primary', labelClass)}
      >
        {label}
      </Label>
      <Input
        id={`${field.name}-input`}
        value={field.value ?? ''}
        onChange={handleChange}
        placeholder={placeholder}
        className={cn(
          'flex h-10 max-h-10 w-full resize-none border-none bg-surface-secondary px-3 py-2',
          inputClass,
        )}
      />
    </div>
  );
}
