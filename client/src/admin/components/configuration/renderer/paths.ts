import type * as t from '~/admin/types';
import { describeField } from '../meta';

/** DOM id for a data path: `endpoints.custom.3.name` → `endpoints-custom-3-name` (no spaces or dots). */
export function toFieldId(path: string): string {
  return path.replace(/[^\w-]+/g, '-');
}

/**
 * Field help text (WS2 `describeField`): the schema description, else the
 * data path's meta description key, else the `com_admin_config_desc_<schema path>`
 * text when translated.
 */
export function fieldDescription(
  field: t.SchemaField,
  meta: t.FieldMeta | undefined,
  localize: t.LocalizeFn,
): string | undefined {
  if (!field.description && meta?.descriptionKey) return localize(meta.descriptionKey);
  return describeField(field, localize);
}

/** Whether a field's value is a container whose overrides are stored as descendant leaves. */
export function isContainerKind(kind: t.ControlKind): boolean {
  return (
    kind === 'record' ||
    kind === 'code' ||
    kind === 'variant' ||
    kind === 'text-record' ||
    kind === 'list-record' ||
    kind === 'switch-object' ||
    kind === 'object'
  );
}

/** A set holds the path itself or any path under it. */
export function hasPathOrDescendant(path: string, paths: Set<string> | undefined): boolean {
  if (!paths) return false;
  if (paths.has(path)) return true;
  const prefix = `${path}.`;
  for (const candidate of paths) {
    if (candidate.startsWith(prefix)) return true;
  }
  return false;
}
