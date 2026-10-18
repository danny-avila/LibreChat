import type * as t from '~/admin/types';
import { Switch } from '~/admin/ui';

export function ToggleField({
  id,
  checked,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: t.ToggleFieldProps) {
  return (
    <Switch
      id={id}
      checked={checked}
      onCheckedChange={onChange}
      disabled={disabled}
      aria-label={ariaLabel}
    />
  );
}
