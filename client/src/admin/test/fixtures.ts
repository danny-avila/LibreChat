import type * as t from '~/admin/types';

export function createField(overrides: Partial<t.SchemaField> & { key: string }): t.SchemaField {
  return {
    path: overrides.path ?? overrides.key,
    type: 'string',
    isOptional: false,
    isNullable: false,
    isArray: false,
    isObject: false,
    depth: 0,
    ...overrides,
  };
}
