import { forwardRef } from 'react';
import type { ChangeEvent, FC, Ref } from 'react';
import { cn, defaultTextPropsLabel, removeFocusOutlines } from '~/utils/';
import { Input, Label } from '~/components/ui';
import { useLocalize } from '~/hooks';

interface InputWithLabelProps {
  id: string;
  value: string;
  label: string;
  subLabel?: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  labelClassName?: string;
  inputClassName?: string;
  ref?: Ref<HTMLInputElement>;
}

const InputWithLabel: FC<InputWithLabelProps> = forwardRef((props, ref) => {
  const { id, value, label, subLabel, onChange, labelClassName = '', inputClassName = '' } = props;
  const localize = useLocalize();
  return (
    <>
      <div className={cn('flex flex-row', labelClassName)}>
        <Label htmlFor={id} className="text-left text-sm font-medium">
          {label}
        </Label>
        {subLabel && (
          <div className="mx-1 text-left text-sm text-gray-700 dark:text-gray-400">{subLabel}</div>
        )}
        <br />
      </div>
      <Input
        id={id}
        data-testid={`input-${id}`}
        value={value ?? ''}
        onChange={onChange}
        ref={ref}
        placeholder={`${localize('com_endpoint_config_value')} ${label}`}
        className={cn(
          defaultTextPropsLabel,
          'flex h-10 max-h-10 w-full resize-none px-3 py-2',
          removeFocusOutlines,
          inputClassName,
        )}
      />
    </>
  );
});

export default InputWithLabel;
