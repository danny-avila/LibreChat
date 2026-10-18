import type * as t from '~/admin/types';
import { cn, MASKED_SECRET, isConfigRecord, isEnvReference } from '~/admin/utils';
import { SECRET_CONFIG_KEYS } from '~/admin/constants';
import { formatReviewValue } from '../review/format';
import { getFieldOptions } from '../controls';
import { useLocalize } from '~/admin/hooks';
import { widthClass } from './display';

const NUMBER_FORMAT = new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 });

function isScalar(value: t.ConfigValue): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

/** One value as text: option labels, On/Off, numbers with their unit, masked secrets. */
function valueText(
  field: t.SchemaField,
  value: t.ConfigValue,
  isSecret: boolean,
  unit: t.FieldUnit | undefined,
  localize: t.LocalizeFn,
): string {
  if (isSecret && typeof value === 'string' && !isEnvReference(value)) return MASKED_SECRET;
  if (typeof value === 'number') {
    const text = NUMBER_FORMAT.format(value);
    return unit ? localize(`com_admin_config_unit_${unit}`, { value: text }) : text;
  }
  if (typeof value === 'boolean') {
    return localize(value ? 'com_admin_config_ctl_on' : 'com_admin_config_ctl_off');
  }
  if (isScalar(value)) {
    const option = getFieldOptions(field, localize).find((o) => o.value === String(value));
    if (option) return option.label;
  }
  return formatReviewValue(value, localize);
}

function isUnset(value: t.ConfigValue): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * A value shown as text where it can't be edited here (read-only sections,
 * sections a profile can't set, no edit permission): the value at body
 * contrast, "Default (…)" or "Not set" when there is none, a list as chips.
 * Never a disabled input, which reads as an empty form field.
 */
export function StaticField({
  id,
  field,
  kind,
  value,
  fallback,
  secretPreview,
  unit,
  width,
}: t.StaticFieldProps) {
  const localize = useLocalize();
  if (secretPreview) {
    return (
      <div id={id} data-static-value="set" className="static-value font-mono">
        {secretPreview}
      </div>
    );
  }
  const isSecret = kind === 'secret' || SECRET_CONFIG_KEYS.has(field.key);
  const format = (v: t.ConfigValue) => valueText(field, v, isSecret, unit, localize);

  if (isUnset(value) || (Array.isArray(value) && value.length === 0)) {
    const text = isUnset(fallback)
      ? localize('com_admin_config_values_not_set')
      : localize('com_admin_config_ctl_default_value', { value: format(fallback) });
    return (
      <div id={id} data-static-value="unset" className="static-value static-value-unset">
        {text}
      </div>
    );
  }

  if (Array.isArray(value) && value.every(isScalar)) {
    return (
      <ul id={id} data-static-value="list" className={cn('static-value-list', widthClass(width))}>
        {value.map((item, index) => (
          <li key={`${index}:${String(item)}`} className="static-value-chip">
            {format(item)}
          </li>
        ))}
      </ul>
    );
  }

  const text = format(value);
  const isBlock = isConfigRecord(value) || Array.isArray(value) || text.includes('\n');
  return (
    <div
      id={id}
      data-static-value="set"
      className={cn('static-value', isBlock && 'static-value-block', widthClass(width))}
    >
      {text}
    </div>
  );
}
