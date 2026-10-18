import type * as t from '~/admin/types';

/**
 * Array settings whose entries have an identity. Edits to them are saved as
 * per-entry operations keyed by that identity, never by array position, so
 * an entry added or removed elsewhere meanwhile cannot shift an edit onto a
 * different entry. `byKey` mirrors LibreChat's `ARRAY_MERGE_KEYS`.
 */
export const KEYED_COLLECTIONS: ReadonlyMap<string, t.KeyedCollection> = new Map(
  (
    [
      {
        path: 'endpoints.custom',
        key: 'name',
        merge: 'byKey',
        secret: { key: 'apiKey', preview: 'apiKeyPreview' },
      },
      { path: 'modelSpecs.list', key: 'name', merge: 'replace' },
    ] satisfies t.KeyedCollection[]
  ).map((collection): [string, t.KeyedCollection] => [collection.path, collection]),
);
