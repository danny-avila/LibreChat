import type * as t from '~/admin/types';

const ARRAY_WILDCARD = '[]';
const RECORD_WILDCARD = '{}';

function createNode(): t.FieldMetaNode {
  return { children: new Map() };
}

/** Splits a registry key into segments, accepting `custom[].name` as well as `custom.[].name`. */
function patternSegments(pattern: string): string[] {
  return pattern
    .replace(/(\[\]|\{\})/g, '.$1')
    .split('.')
    .filter((segment) => segment !== '');
}

function isWildcard(segment: string): boolean {
  return segment === ARRAY_WILDCARD || segment === RECORD_WILDCARD;
}

/**
 * Compiles registries into a segment trie. Later registries extend earlier
 * ones: entries for the same pattern are merged, later keys winning.
 */
export function buildFieldMetaRegistry(registries: t.FieldMetaRegistry[]): t.FieldMetaNode {
  const root = createNode();
  for (const registry of registries) {
    for (const [pattern, meta] of Object.entries(registry)) {
      let node = root;
      for (const segment of patternSegments(pattern)) {
        let child = node.children.get(segment);
        if (!child) {
          child = createNode();
          node.children.set(segment, child);
        }
        node = child;
      }
      node.meta = node.meta ? { ...node.meta, ...meta } : meta;
    }
  }
  return root;
}

function findMeta(
  node: t.FieldMetaNode,
  segments: string[],
  index: number,
): t.FieldMeta | undefined {
  if (index === segments.length) return node.meta;
  const segment = segments[index];
  const exact = node.children.get(segment);
  const exactMatch = exact ? findMeta(exact, segments, index + 1) : undefined;
  if (exactMatch || isWildcard(segment)) return exactMatch;
  const array = node.children.get(ARRAY_WILDCARD);
  const arrayMatch = array ? findMeta(array, segments, index + 1) : undefined;
  if (arrayMatch) return arrayMatch;
  const record = node.children.get(RECORD_WILDCARD);
  return record ? findMeta(record, segments, index + 1) : undefined;
}

/**
 * Metadata for a data path (`endpoints.custom.3.name`, `mcpServers.github.startup`)
 * or a schema path (`endpoints.custom.[].name`). Literal segments win over
 * wildcards; a `[]`/`{}` wildcard matches any one segment.
 */
export function resolveFieldMeta(root: t.FieldMetaNode, path: string): t.FieldMeta | undefined {
  return findMeta(root, patternSegments(path), 0);
}
