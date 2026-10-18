import { useState } from 'react';
import type * as t from '~/admin/types';
import { SelectField } from './SelectField';
import { useLocalize } from '~/admin/hooks';

function asRecord(value: t.ConfigValue): t.ConfigRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** The branch a value belongs to: by discriminator, else the branch whose fields cover most of its keys. */
export function matchVariant(
  value: t.ConfigValue,
  variants: readonly t.FieldVariant[],
  discriminator?: string,
): t.FieldVariant | undefined {
  const record = asRecord(value);
  const keys = Object.keys(record);
  if (keys.length === 0) return undefined;
  if (discriminator) {
    const tag = record[discriminator];
    return variants.find((variant) => variant.discriminatorValue === tag);
  }
  let best: t.FieldVariant | undefined;
  let bestScore = 0;
  for (const variant of variants) {
    const own = new Set(variant.fields.map((field) => field.key));
    const score = keys.filter((key) => own.has(key)).length;
    if (score > bestScore) {
      best = variant;
      bestScore = score;
    }
  }
  return best;
}

/**
 * The value after switching to `next`: keys the two branches share are kept,
 * the discriminator is set, and the old branch's own keys are dropped.
 * `tombstones` lists the dropped keys that a lower layer (librechat.yaml,
 * Base) still provides, which must be hidden for the switch to take effect.
 */
export function switchVariant(
  value: t.ConfigValue,
  next: t.FieldVariant,
  discriminator: string | undefined,
  inheritedKeys: readonly string[],
): { value: t.ConfigRecord; tombstones: string[] } {
  const record = asRecord(value);
  const allowed = new Set(next.fields.map((field) => field.key));
  const result: t.ConfigRecord = {};
  for (const [key, child] of Object.entries(record)) {
    if (allowed.has(key) && key !== discriminator) result[key] = child;
  }
  if (discriminator && next.discriminatorValue !== undefined) {
    result[discriminator] = next.discriminatorValue;
  }
  const tombstones = inheritedKeys.filter((key) => !allowed.has(key) && key !== discriminator);
  return { value: result, tombstones };
}

function fieldsOf(variant: t.FieldVariant, discriminator: string | undefined): t.SchemaField[] {
  return variant.fields.filter((field) => field.key !== discriminator);
}

/**
 * A union of object shapes (e.g. `memory.agent`: an existing agent ID, or an
 * inline provider/model) or a discriminated union (`summarization.trigger`):
 * a Type select plus the chosen branch's fields. Switching branches writes
 * the whole object, and reports the keys a lower layer still sets through
 * `onTombstone`, since LibreChat merges overrides onto librechat.yaml and the
 * old branch's keys would otherwise come back.
 */
export function VariantField({
  id,
  value,
  variants,
  discriminator,
  inheritedKeys = [],
  onChange,
  onTombstone,
  renderFields,
  disabled,
  'aria-label': ariaLabel,
}: t.VariantFieldProps) {
  const localize = useLocalize();
  const matched = matchVariant(value, variants, discriminator);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const pending = variants.find((variant) => variant.key === pendingKey);
  const pendingBlocked =
    pending && matched && pending !== matched && !onTombstone
      ? switchVariant(value, pending, discriminator, inheritedKeys).tombstones
      : [];
  /** A chosen branch shows while the value fits no branch yet, or while the switch is blocked. */
  const showsPending = pending != null && (!matched || pendingBlocked.length > 0);
  const record = asRecord(value);
  /** Nothing set and no branch chosen: LibreChat's default applies, and no branch is shown. */
  const isUnset = !matched && !showsPending && Object.keys(record).length === 0;
  const active = (showsPending ? pending : matched) ?? (isUnset ? undefined : variants[0]);
  const blockedKeys = showsPending ? pendingBlocked : [];

  const choose = (key: string) => {
    const next = variants.find((variant) => variant.key === key);
    if (!next || next === active) return;
    if (next === matched) {
      setPendingKey(null);
      return;
    }
    const switched = switchVariant(value, next, discriminator, inheritedKeys);
    setPendingKey(next.key);
    if (switched.tombstones.length > 0) {
      if (!onTombstone) return;
      onTombstone(switched.tombstones);
    }
    if (Object.keys(switched.value).length > 0) {
      onChange(switched.value);
      return;
    }
    /** Nothing carries over: the own value goes, and the new branch's fields start empty. */
    if (Object.keys(record).length > 0) onChange(undefined);
  };

  const shownValue = active === matched || !matched ? record : {};

  return (
    <div className="flex w-full flex-col gap-3">
      <SelectField
        id={id}
        value={active?.key}
        options={variants.map((variant) => ({
          value: variant.key,
          label: variant.label ?? localize(`com_admin_config_ctl_variant_${variant.key}`),
        }))}
        onChange={choose}
        onClear={matched ? undefined : () => setPendingKey(null)}
        defaultLabel={localize('com_admin_config_ctl_default_unknown')}
        disabled={disabled}
        aria-label={localize('com_admin_config_ctl_variant_type', { name: ariaLabel ?? '' })}
      />
      {blockedKeys.length > 0 && (
        <span role="alert" className="text-xs text-(--cui-color-text-warning)">
          {localize('com_admin_config_ctl_variant_blocked', { keys: blockedKeys.join(', ') })}
        </span>
      )}
      {active && blockedKeys.length === 0 && (
        <div className="flex flex-col gap-3 border-l-2 border-(--cui-color-stroke-default) pl-4">
          {renderFields(fieldsOf(active, discriminator), shownValue, (key, child) => {
            const base =
              active === matched ? record : switchVariant(value, active, discriminator, []).value;
            const next = { ...base, [key]: child };
            if (child === undefined) delete next[key];
            if (discriminator && active.discriminatorValue !== undefined) {
              next[discriminator] = active.discriminatorValue;
            }
            setPendingKey(null);
            onChange(next);
          })}
        </div>
      )}
    </div>
  );
}
