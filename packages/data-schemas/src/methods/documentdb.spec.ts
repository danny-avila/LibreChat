import fs from 'fs';
import path from 'path';

/**
 * Static guard for the Amazon DocumentDB write and read surface.
 *
 * DocumentDB is a supported deployment target (see the root README and
 * `misc/documentdb/documentdb-compat.md`), but nothing in the normal test
 * pyramid can catch an incompatibility: every suite runs against
 * `mongodb-memory-server`, which is real MongoDB and accepts all of these
 * constructs. Each verdict below was established against a live DocumentDB
 * 5.0.0 cluster — the engine version this project documents as supported — and
 * the exact server error is recorded beside it.
 *
 * If a construct here becomes genuinely necessary, the fix is a compatible
 * rewrite, not an exception list: `misc/documentdb/audit.documentdb.spec.ts`
 * re-adjudicates any of this against a real cluster.
 */
const SOURCE_ROOT = path.join(__dirname, '..');

/** Aggregation-pipeline updates: `Failed to parse update: field must be of BSON type object`. */
const UPDATE_METHODS = [
  'findOneAndUpdate',
  'findByIdAndUpdate',
  'findOneAndReplace',
  'updateOne',
  'updateMany',
  'replaceOne',
];

/** `$$REMOVE`: `Feature not supported: $$REMOVE`. `$facet`: `Aggregation stage not supported`. */
const FORBIDDEN_TOKENS = ['$$REMOVE', '$$CURRENT', '$facet', '$graphLookup', '$unionWith'];

function collectSourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(target, found);
      continue;
    }
    if (/\.ts$/.test(entry.name) && !/\.(spec|test)\.ts$/.test(entry.name)) {
      found.push(target);
    }
  }
  return found;
}

/** Reports every call whose update argument is an array, which is the
 * pipeline-update form. Brace matching is enough here because the update is the
 * second argument and the scan only needs to know whether it opens with `[`. */
function findPipelineUpdates(source: string): number[] {
  const lines: number[] = [];
  for (const method of UPDATE_METHODS) {
    const pattern = new RegExp(`\\.${method}\\s*(<[^(]*>)?\\s*\\(`, 'g');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      let index = match.index + match[0].length;
      let depth = 1;
      while (index < source.length && depth > 0) {
        const character = source[index];
        if (character === '(' || character === '{' || character === '[') depth += 1;
        else if (character === ')' || character === '}' || character === ']') depth -= 1;
        else if (character === ',' && depth === 1) {
          let next = index + 1;
          while (next < source.length && /\s/.test(source[next])) next += 1;
          if (source[next] === '[') {
            lines.push(source.slice(0, match.index).split('\n').length);
          }
          break;
        }
        index += 1;
      }
    }
  }
  return lines;
}

describe('Amazon DocumentDB compatibility', () => {
  const sourceFiles = collectSourceFiles(SOURCE_ROOT);

  it('scans the package sources', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it('uses no aggregation-pipeline updates', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      for (const line of findPipelineUpdates(fs.readFileSync(file, 'utf8'))) {
        offenders.push(`${path.relative(SOURCE_ROOT, file)}:${line}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('uses no aggregation constructs the engine rejects', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const source = fs.readFileSync(file, 'utf8');
      const relative = path.relative(SOURCE_ROOT, file);
      for (const token of FORBIDDEN_TOKENS) {
        const pattern = new RegExp(`['"\`]?\\${token}\\b`, 'g');
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(source)) !== null) {
          const line = source.slice(0, match.index).split('\n').length;
          const text = source.split('\n')[line - 1];
          /** Prose naming the construct is how the rewrites explain themselves. */
          if (/^\s*(\*|\/\/|\/\*)/.test(text)) continue;
          offenders.push(`${relative}:${line} ${token}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
