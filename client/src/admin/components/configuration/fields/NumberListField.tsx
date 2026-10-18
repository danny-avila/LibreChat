import { useRef, useLayoutEffect } from 'react';
import type * as t from '~/admin/types';
import { AddItemButton, TrashButton } from '~/admin/components/shared';
import { useLocalize } from '~/admin/hooks';

export function NumberListField({
  id,
  values,
  onChange,
  disabled,
  placeholder,
  itemLabel,
}: t.NumberListFieldProps) {
  const localize = useLocalize();
  const listRef = useRef<HTMLDivElement>(null);
  const focusLastRef = useRef(false);

  useLayoutEffect(() => {
    if (focusLastRef.current) {
      focusLastRef.current = false;
      const inputs = listRef.current?.querySelectorAll<HTMLElement>('input');
      inputs?.[inputs.length - 1]?.focus();
    }
  });

  const resolvedPlaceholder = placeholder ?? localize('com_admin_ui_enter_number');
  const resolvedItemLabel = itemLabel ?? localize('com_admin_ui_item');

  const handleAdd = () => {
    onChange([...values, 0]);
    focusLastRef.current = true;
  };
  const handleRemove = (index: number) => onChange(values.filter((_, i) => i !== index));
  const handleChange = (index: number, val: number) => {
    const next = [...values];
    next[index] = val;
    onChange(next);
  };

  return (
    <div ref={listRef} id={id} className="flex w-full max-w-75 flex-col gap-2" role="list">
      {values.map((value, index) => (
        <div key={index} className="flex items-center gap-2" role="listitem">
          <input
            type="number"
            value={value}
            onChange={(e) => handleChange(index, Number(e.target.value))}
            placeholder={resolvedPlaceholder}
            disabled={disabled}
            aria-label={`${resolvedItemLabel} ${index + 1}`}
            className="config-input flex-1"
          />
          {!disabled && (
            <TrashButton
              onClick={() => handleRemove(index)}
              ariaLabel={`${localize('com_admin_ui_delete')} ${resolvedItemLabel} ${index + 1}`}
            />
          )}
        </div>
      ))}

      {!disabled && (
        <div role="listitem">
          <AddItemButton
            label={localize('com_admin_ui_add_item', { item: resolvedItemLabel })}
            onClick={handleAdd}
          />
        </div>
      )}
    </div>
  );
}
