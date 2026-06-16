import type { TraverseContext } from './object-traverse';
import traverse from './object-traverse';

/** Collects the dotted leaf paths visited during a traversal. */
function collectLeafPaths(input: unknown): string[] {
  const paths: string[] = [];
  traverse(input).forEach(function (this: TraverseContext) {
    if (this.isLeaf && !this.isRoot) {
      paths.push(this.path.join('.'));
    }
  });
  return paths;
}

describe('object-traverse', () => {
  it('visits every leaf of a plain nested object', () => {
    const paths = collectLeafPaths({ a: 1, b: { c: 2, d: 3 } });
    expect(paths).toEqual(expect.arrayContaining(['a', 'b.c', 'b.d']));
  });

  it('traverses shared (non-circular) references that appear in multiple branches', () => {
    const shared = { secret: 'value' };
    const input = { a: shared, b: shared };

    const paths = collectLeafPaths(input);

    // Both branches reference the same object, but it is NOT circular, so each
    // occurrence must be traversed independently.
    expect(paths).toContain('a.secret');
    expect(paths).toContain('b.secret');
  });

  it('traverses an array containing the same object multiple times', () => {
    const shared = { value: 42 };
    const paths = collectLeafPaths([shared, shared, shared]);

    expect(paths).toEqual(['0.value', '1.value', '2.value']);
  });

  it('invokes the callback for shared references rather than skipping them', () => {
    const shared = { name: 'duplicate' };
    const input = { first: shared, second: shared };

    const visitedNodes: unknown[] = [];
    traverse(input).forEach(function (this: TraverseContext, value: unknown) {
      visitedNodes.push(value);
    });

    // root, first(obj), first.name, second(obj), second.name
    expect(visitedNodes.filter((node) => node === shared)).toHaveLength(2);
  });

  it('does not infinitely recurse on a self-referential (circular) object', () => {
    const node: Record<string, unknown> = { id: 1 };
    node.self = node;

    const paths = collectLeafPaths(node);

    // The circular `self` edge must not be followed, but the primitive leaf
    // `id` is still visited.
    expect(paths).toContain('id');
    expect(paths).not.toContain('self.id');
  });

  it('does not treat a diamond-shaped (DAG) structure as circular', () => {
    const leaf = { v: 1 };
    const left = { leaf };
    const right = { leaf };
    const input = { left, right };

    const paths = collectLeafPaths(input);

    expect(paths).toContain('left.leaf.v');
    expect(paths).toContain('right.leaf.v');
  });
});
