import type { ReactNode } from 'react';
import type * as t from '~/admin/types';
import { renderInlineField } from '../../renderer';

/**
 * Defines how fields are grouped inside custom endpoint cards and the create
 * dialog. Fields not listed in any group are collected into a catch-all
 * "Advanced" group (collapsed by default).
 *
 * To apply this pattern to other collection types, add a new entry keyed by
 * the collection's schema parent key and define the groups.
 */
export const FIELD_GROUPS: Record<string, t.FieldGroupDef[]> = {
  custom: [
    {
      labelKey: 'com_admin_config_group_connection',
      fields: ['name', 'apiKey', 'baseURL', 'iconURL'],
      defaultExpanded: true,
    },
    {
      labelKey: 'com_admin_config_group_models',
      fields: ['models', 'modelDisplayLabel'],
      defaultExpanded: true,
    },
    {
      labelKey: 'com_admin_config_group_title_generation',
      fields: [
        'titleConvo',
        'titleModel',
        'titleMethod',
        'titlePrompt',
        'titlePromptTemplate',
        'titleEndpoint',
        'titleMessageRole',
      ],
      defaultExpanded: false,
    },
    {
      labelKey: 'com_admin_config_group_summarization',
      fields: ['summarize', 'summaryModel'],
      defaultExpanded: false,
    },
  ],
};

/**
 * Fields that are effectively required for a functional custom endpoint.
 * The config schema uses `endpointSchema.partial()` which makes everything
 * optional at the Zod level, but these fields are needed for an endpoint
 * to actually work. We override `isOptional` for these keys so the UI
 * shows required indicators.
 */
const REQUIRED_ENDPOINT_KEYS = new Set(['name', 'apiKey', 'baseURL']);

function withRequired(field: t.SchemaField): t.SchemaField {
  if (REQUIRED_ENDPOINT_KEYS.has(field.key)) {
    return { ...field, isOptional: false };
  }
  if (field.key === 'default' && field.path?.endsWith('models.default')) {
    return { ...field, isOptional: false };
  }
  return field;
}

/**
 * Flatten a field's children into the group when the field is a nested object.
 * This prevents double-collapsible nesting (e.g. Models group > models collapsible).
 * The children are rendered with a prefixed onChange that writes back into the
 * parent object at the correct key.
 */
export function flattenGroupFields(
  fields: t.SchemaField[],
  parentValue: t.ConfigValue,
  parentPath: string,
  onChange: (path: string, value: t.ConfigValue) => void,
  localize: (key: string, interpolation?: Record<string, string | number>) => string,
  disabled?: boolean,
  collectionRenderOverrides?: Record<string, t.CollectionRenderFields>,
  editSessionId?: number,
  lockedKeys?: ReadonlySet<string>,
): ReactNode[] {
  const values =
    typeof parentValue === 'object' && parentValue !== null && !Array.isArray(parentValue)
      ? (parentValue as Record<string, t.ConfigValue>)
      : {};

  const nodes: ReactNode[] = [];
  for (const field of fields) {
    if (field.children && field.children.length > 0 && !field.isArray && field.type !== 'record') {
      const nested = values[field.key];
      const nestedObj =
        typeof nested === 'object' && nested !== null && !Array.isArray(nested)
          ? (nested as Record<string, t.ConfigValue>)
          : {};
      for (const child of field.children) {
        nodes.push(
          renderInlineField(
            withRequired(child),
            nested,
            `${parentPath}.${field.key}`,
            (childKey, childValue) => {
              onChange(field.key, { ...nestedObj, [childKey]: childValue });
            },
            localize,
            disabled,
            collectionRenderOverrides,
            true,
            editSessionId,
          ),
        );
      }
    } else {
      nodes.push(
        renderInlineField(
          withRequired(field),
          parentValue,
          parentPath,
          onChange,
          localize,
          disabled || (lockedKeys?.has(field.key) ?? false),
          collectionRenderOverrides,
          true,
          editSessionId,
        ),
      );
    }
  }
  return nodes;
}
