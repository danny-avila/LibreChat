import { useState, useEffect, useRef } from 'react';
import yaml from 'js-yaml';
import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { cn } from '~/admin/utils';

function toYaml(value: t.ConfigValue): string {
  if (value === undefined || value === null) return '';
  return yaml.dump(value, { lineWidth: -1 }).trimEnd();
}

export function CodeField({
  id,
  value,
  onChange,
  disabled,
  'aria-label': ariaLabel,
}: t.CodeFieldProps) {
  const localize = useLocalize();
  const [text, setText] = useState(() => toYaml(value));
  const [error, setError] = useState<string>();
  const externalValue = useRef(value);

  useEffect(() => {
    if (value !== externalValue.current) {
      externalValue.current = value;
      setText(toYaml(value));
      setError(undefined);
    }
  }, [value]);

  const handleBlur = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setError(undefined);
      onChange(undefined);
      return;
    }
    try {
      const parsed = yaml.load(trimmed, { schema: yaml.JSON_SCHEMA }) as t.ConfigValue;
      setError(undefined);
      externalValue.current = parsed;
      onChange(parsed);
    } catch {
      setError(localize('com_admin_ui_invalid_yaml'));
    }
  };

  const rows = Math.max(2, Math.min(12, text.split('\n').length));

  return (
    <div className="flex w-full max-w-100 flex-col gap-1">
      <textarea
        id={id}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(undefined);
        }}
        onBlur={handleBlur}
        placeholder={localize('com_admin_ui_edit_yaml')}
        disabled={disabled}
        rows={rows}
        aria-label={ariaLabel}
        className={cn(
          'config-input config-input-mono w-full resize-y tabular-nums',
          error && 'config-input-error',
        )}
        spellCheck={false}
      />
      {error && <span className="text-xs text-(--cui-color-text-danger)">{error}</span>}
    </div>
  );
}
