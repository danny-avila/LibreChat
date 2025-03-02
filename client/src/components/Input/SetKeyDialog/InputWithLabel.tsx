import { forwardRef } from 'react';
import type { ChangeEvent, FC, Ref } from 'react';
import { cn, defaultTextPropsLabel, removeFocusOutlines, defaultTextProps } from '~/utils/';
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
      <div className={cn('mt-4 flex flex-row', labelClassName)}>
        <Label htmlFor={id} className="text-left text-sm font-medium">
          {label}
        </Label>
        {Label && <Label className="mx-1 text-right text-sm text-text-secondary">{subLabel}</Label>}
        <br />
      </div>
      <div className="h-1" />
      <Input
        id={id}
        data-testid={`input-${id}`}
        value={value ?? ''}
        onChange={onChange}
        ref={ref}
        placeholder={`${localize('com_endpoint_config_value')} ${label}`}
        className={cn('flex h-10 max-h-10 w-full resize-none px-3 py-2')}
      />
    </>
  );
});

export default InputWithLabel;
