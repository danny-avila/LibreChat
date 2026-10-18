import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { renderInlineField } from '../../renderer';
import { useLocalize } from '~/admin/hooks';

/** Maps type → valid component choices. */
const TYPE_COMPONENTS: Record<string, string[]> = {
  number: ['input', 'slider'],
  boolean: ['checkbox', 'switch'],
  string: ['input', 'textarea'],
  enum: ['dropdown', 'slider', 'combobox'],
  array: ['tags'],
};

/** Maps component → extra fields that become relevant. */
const COMPONENT_FIELDS: Record<string, string[]> = {
  input: ['minText', 'maxText', 'placeholder'],
  textarea: ['minText', 'maxText', 'placeholder'],
  slider: ['range', 'includeInput'],
  checkbox: [],
  switch: [],
  dropdown: ['options'],
  combobox: [
    'options',
    'items',
    'searchPlaceholder',
    'selectPlaceholder',
    'searchPlaceholderCode',
    'selectPlaceholderCode',
  ],
  tags: ['minTags', 'maxTags'],
};

/** Fields always visible regardless of type/component. */
const ALWAYS_VISIBLE = new Set(['key', 'type', 'component', 'description', 'default', 'label']);

/** Explicit field ordering for paramDefinition entries. Fields listed here
 *  appear first in this order; unlisted fields follow in schema order. */
const PARAM_FIELD_ORDER = [
  'key',
  'description',
  'label',
  'type',
  'component',
  'default',
  'options',
];

/** Fields visible when options are relevant (enum, dropdown, combobox, checkbox, switch). */
const OPTIONS_TYPES = new Set(['enum']);
const OPTIONS_COMPONENTS = new Set(['dropdown', 'combobox', 'checkbox', 'switch', 'slider']);

function ParamDefinitionEntry({
  fields,
  parentValue,
  parentPath,
  onChange,
}: {
  fields: t.SchemaField[];
  parentValue: t.ConfigValue;
  parentPath: string;
  onChange: (path: string, value: t.ConfigValue) => void;
}) {
  const localize = useLocalize();
  const values =
    typeof parentValue === 'object' && parentValue !== null && !Array.isArray(parentValue)
      ? (parentValue as Record<string, t.ConfigValue>)
      : {};

  const currentType = typeof values.type === 'string' ? values.type : '';
  const currentComponent = typeof values.component === 'string' ? values.component : '';

  // Build the set of visible field keys based on current type + component
  const visibleKeys = new Set(ALWAYS_VISIBLE);

  if (currentType && OPTIONS_TYPES.has(currentType)) {
    visibleKeys.add('options');
    visibleKeys.add('enumMappings');
  }
  if (currentComponent && OPTIONS_COMPONENTS.has(currentComponent)) {
    visibleKeys.add('options');
  }
  if (currentComponent) {
    for (const key of COMPONENT_FIELDS[currentComponent] ?? []) {
      visibleKeys.add(key);
    }
  }
  // Layout fields always available
  visibleKeys.add('showLabel');
  visibleKeys.add('showDefault');
  visibleKeys.add('columnSpan');
  visibleKeys.add('columns');

  // Filter visible fields, then order: prioritized fields first, rest in schema order
  const fieldsByKey = new Map(fields.map((f) => [f.key, f]));
  const orderSet = new Set(PARAM_FIELD_ORDER);
  const ordered = PARAM_FIELD_ORDER.map((key) => fieldsByKey.get(key)).filter(
    (f): f is t.SchemaField => f != null && visibleKeys.has(f.key),
  );
  const rest = fields.filter((f) => !orderSet.has(f.key) && visibleKeys.has(f.key));
  const visibleFields = [...ordered, ...rest];

  // For the "type" field, we want to clear component when type changes
  // since the valid components differ per type
  const handleChange = (key: string, value: t.ConfigValue) => {
    if (key === 'type') {
      // Clear component when type changes — the valid set differs
      const newComponents = TYPE_COMPONENTS[value as string] ?? [];
      const currentComp = values.component as string | undefined;
      if (currentComp && !newComponents.includes(currentComp)) {
        onChange(key, value);
        onChange('component', undefined);
        return;
      }
    }
    onChange(key, value);
  };

  return (
    <div className="flex flex-col gap-3">
      {visibleFields.map((field) =>
        renderInlineField(field, parentValue, parentPath, handleChange, localize),
      )}
    </div>
  );
}

export function renderParamDefinitionFields(
  fields: t.SchemaField[],
  parentValue: t.ConfigValue,
  parentPath: string,
  onChange: (path: string, value: t.ConfigValue) => void,
): ReactNode {
  return (
    <ParamDefinitionEntry
      fields={fields}
      parentValue={parentValue}
      parentPath={parentPath}
      onChange={onChange}
    />
  );
}
