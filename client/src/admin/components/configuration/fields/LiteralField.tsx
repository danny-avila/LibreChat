import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Checkbox } from '~/admin/ui';

/**
 * A field whose schema accepts exactly one value (e.g. a custom endpoint's
 * `provider: 'anthropic'`): a checkbox that sets that value or removes it, so
 * a typo can never reach the save. A stored value that differs from the
 * literal is shown as invalid until it is changed.
 */
export function LiteralField({
  id,
  literal,
  value,
  onChange,
  disabled,
  label,
}: t.LiteralFieldProps) {
  const localize = useLocalize();
  const checked = value === literal;
  const invalid = value !== undefined && value !== null && !checked;

  return (
    <div className="flex flex-col gap-1">
      <Checkbox
        id={id}
        checked={checked}
        disabled={disabled}
        label={label ?? localize('com_admin_config_ctl_literal', { value: String(literal) })}
        onCheckedChange={(next) => onChange(next === true ? literal : undefined)}
      />
      {invalid && (
        <span role="alert" className="text-xs text-(--cui-color-text-danger)">
          {localize('com_admin_config_ctl_literal_invalid', {
            value: String(value),
            literal: String(literal),
          })}
        </span>
      )}
    </div>
  );
}
