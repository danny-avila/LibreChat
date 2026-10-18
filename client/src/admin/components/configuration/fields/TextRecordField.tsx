import { useState } from 'react';
import type * as t from '~/admin/types';
import { TextareaField } from './TextareaField';
import { KeyValueField } from './KeyValueField';
import { useLocalize } from '~/admin/hooks';
import { ButtonGroup } from '~/admin/ui';
import { TextField } from './TextField';
import { ListField } from './ListField';

type Mode = 'simple' | 'advanced';

/** Locale a single text becomes when switching to per-language mode. */
const SEED_LOCALE = 'en';
const STRING_ONLY: t.KVValueType[] = ['string'];

function inferMode(value: t.ConfigValue): Mode {
  return typeof value === 'object' && value !== null ? 'advanced' : 'simple';
}

function isMultiEntryRecord(value: t.ConfigValue): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length > 1
  );
}

/**
 * `string | record<locale, string>` (variant `record`: one text or one text
 * per language) and `string | string[]` (variant `array`: one text or a list
 * of paragraphs), with a labelled segmented control to switch forms.
 * Converting a single text to per-language seeds it under `en`.
 */
export function TextRecordField({
  id,
  value,
  onChange,
  disabled,
  variant,
  'aria-label': ariaLabel,
}: t.TextRecordFieldProps) {
  const localize = useLocalize();
  const [mode, setMode] = useState<Mode>(() => inferMode(value));
  const [syncedKind, setSyncedKind] = useState(() => inferMode(value));
  const valueMode = inferMode(value);
  if (valueMode !== syncedKind) {
    setSyncedKind(valueMode);
    setMode(valueMode);
  }

  const toAdvanced = () => {
    setMode('advanced');
    const text = typeof value === 'string' ? value : '';
    if (!text) return;
    if (variant === 'record') onChange({ [SEED_LOCALE]: text });
    else onChange(text.split('\n\n').filter(Boolean));
  };
  const toSimple = () => {
    setMode('simple');
    if (value === undefined || value === null) return;
    if (variant === 'record') {
      const record =
        typeof value === 'object' && value !== null && !Array.isArray(value) ? value : {};
      const first = record[SEED_LOCALE] ?? Object.values(record)[0];
      onChange(typeof first === 'string' && first !== '' ? first : undefined);
    } else {
      const list = Array.isArray(value) ? value : [];
      const text = list.filter((item): item is string => typeof item === 'string').join('\n\n');
      onChange(text || undefined);
    }
  };

  const canSimplify = variant !== 'record' || !isMultiEntryRecord(value);
  const labels =
    variant === 'record'
      ? {
          simple: 'com_admin_config_ctl_text_single',
          advanced: 'com_admin_config_ctl_text_per_language',
        }
      : {
          simple: 'com_admin_config_ctl_text_single',
          advanced: 'com_admin_config_ctl_text_paragraphs',
        };

  return (
    <div id={id} className="flex w-full max-w-150 flex-col gap-2">
      {!disabled && (
        <ButtonGroup
          aria-label={localize('com_admin_config_ctl_text_form', { name: ariaLabel ?? '' })}
          className="max-w-full self-start"
          selected={mode}
          onClick={(next) => {
            if (disabled || next === mode) return;
            if (next === 'advanced') toAdvanced();
            else toSimple();
          }}
          options={[
            {
              value: 'simple',
              label: localize(labels.simple),
              disabled: disabled || (mode === 'advanced' && !canSimplify),
              title: !canSimplify ? localize('com_admin_config_simplify_disabled') : undefined,
            },
            { value: 'advanced', label: localize(labels.advanced), disabled },
          ]}
        />
      )}
      {mode === 'simple' && variant === 'record' && (
        <TextField
          id={`${id}-text`}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          onClear={() => onChange(undefined)}
          disabled={disabled}
          width="L"
          aria-label={ariaLabel}
        />
      )}
      {mode === 'simple' && variant === 'array' && (
        <TextareaField
          id={`${id}-textarea`}
          value={typeof value === 'string' ? value : ''}
          onChange={onChange}
          onClear={() => onChange(undefined)}
          disabled={disabled}
          rows={4}
          aria-label={ariaLabel}
        />
      )}
      {mode === 'advanced' && variant === 'record' && (
        <KeyValueField
          id={`${id}-kv`}
          pairs={objectToPairs(value)}
          onChange={(pairs) => onChange(pairsToObject(pairs))}
          onClear={() => onChange(undefined)}
          disabled={disabled}
          valueTypes={STRING_ONLY}
          keyPlaceholder={localize('com_admin_config_ctl_text_locale')}
          valuePlaceholder={localize('com_admin_config_ctl_text_translation')}
          aria-label={ariaLabel}
        />
      )}
      {mode === 'advanced' && variant === 'array' && (
        <ListField
          id={`${id}-list`}
          values={
            Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []
          }
          onChange={onChange}
          onClear={() => onChange(undefined)}
          disabled={disabled}
          multiline
          width="L"
          itemLabel={localize('com_admin_config_ctl_text_paragraph')}
          aria-label={ariaLabel}
        />
      )}
    </div>
  );
}

function objectToPairs(value: t.ConfigValue): t.KeyValuePair[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  return Object.entries(value).map(([key, v]) => ({
    key,
    value: typeof v === 'string' ? v : String(v ?? ''),
    valueType: 'string',
  }));
}

function pairsToObject(pairs: t.KeyValuePair[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const p of pairs) {
    if (p.key) result[p.key] = p.value;
  }
  return result;
}
