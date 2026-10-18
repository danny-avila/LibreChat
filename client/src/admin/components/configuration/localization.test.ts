/**
 * Ensures every config field extracted from the schema has a matching
 * locale key in translation.json.  Catches fields that would render
 * their raw key (e.g. `com_admin_config_field_thinkingLevel`) in the UI.
 */
import { join } from 'node:path';
import { readdirSync, readFileSync } from 'node:fs';
import { configSchema } from 'librechat-data-provider';
import type { ZodSchemaLike } from '~/admin/types/config';
import { extractSchemaTree, flattenTree } from '~/admin/api/config';
import translation from '~/locales/en/translation.json';
import { SKIP_REASON_KEYS } from '~/admin/constants';

const localeKeys = new Set(Object.keys(translation));

const SOURCE_ROOT = join(__dirname, '..', '..');
const LOCALE_LITERAL = /'(com_[a-z0-9_]*[a-z0-9])'/g;

function isLocalized(key: string): boolean {
  return localeKeys.has(key) || localeKeys.has(`${key}_one`) || localeKeys.has(`${key}_other`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !entry.name.includes('.test.') ? [path] : [];
  });
}

describe('locale keys referenced in code', () => {
  it('every skip reason has a translation', () => {
    const missing = Object.values(SKIP_REASON_KEYS).filter((key) => !isLocalized(key));
    expect(missing).toEqual([]);
  });

  it('every literal com_* key in the source has a translation', () => {
    const missing = sourceFiles(SOURCE_ROOT).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(LOCALE_LITERAL)]
        .map(([, key]) => key)
        .filter((key) => !isLocalized(key))
        .map((key) => `${key} (${file.slice(SOURCE_ROOT.length + 1)})`),
    );
    expect(missing).toEqual([]);
  });
});

describe('config field localization coverage', () => {
  const tree = extractSchemaTree(configSchema as ZodSchemaLike);
  const allFields = flattenTree(tree);

  it('every schema field has a com_config_field_* locale key', () => {
    const missing: string[] = [];

    for (const field of allFields) {
      const key = `com_admin_config_field_${field.key}`;
      if (!localeKeys.has(key)) {
        missing.push(`${field.key}  →  ${key}`);
      }
    }

    expect(missing).toHaveLength(0);
  });

  it('every array field has a com_config_field_*_item locale key', () => {
    const arrays = allFields.filter((f) => f.isArray);
    const missing: string[] = [];

    for (const field of arrays) {
      const key = `com_admin_config_field_${field.key}_item`;
      if (!localeKeys.has(key)) {
        missing.push(`${field.key}  →  ${key}`);
      }
    }

    expect(missing).toHaveLength(0);
  });
});
