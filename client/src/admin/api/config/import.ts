import { z } from 'zod';
import yaml from 'js-yaml';
import { configSchema } from 'librechat-data-provider';
import type * as t from '~/admin/types';
import { findUnknownImportPaths } from '~/admin/utils';
import { createServerFn } from '~/admin/api/utils/fn';

/** Leaf paths of `raw` the bundled config schema does not describe (AppService aliases resolved). */
export function findUnknownConfigPaths(raw: Record<string, t.ConfigValue>): string[] {
  return findUnknownImportPaths(raw);
}

/**
 * Parses and validates pasted/uploaded YAML for import. Validation runs on a
 * copy with `version` replaced (a snippet need not carry it, and import never
 * writes it, so `version: 1.2` read as a number must not fail), but the result
 * is the raw parsed object: no Zod defaults are injected and keys the bundled
 * schema does not know are kept (and reported in `unknownPaths`). Keys the
 * admin API can't store do not fail the parse: the import plan leaves out
 * only the leaves that carry them, and only when they would be written.
 */
export function parseConfigYaml(yamlContent: string): t.ImportParseResult {
  const failure = (
    error: string,
    extra: Pick<t.ImportParseResult, 'validationErrors' | 'mark'> = {},
  ): t.ImportParseResult => ({
    success: false,
    error,
    appConfig: null,
    unknownPaths: [],
    ...extra,
  });

  let rawConfig: unknown;
  try {
    rawConfig = yaml.load(yamlContent, { schema: yaml.JSON_SCHEMA });
  } catch (parseError) {
    const { mark, reason } = parseError as {
      mark?: { line: number; column: number };
      reason?: string;
    };
    if (!mark) return failure('Invalid YAML syntax. Please check the content for syntax errors.');
    const line = mark.line + 1;
    const column = mark.column + 1;
    return failure(
      `Invalid YAML syntax (line ${line}, column ${column})${reason ? `: ${reason}` : ''}`,
      { mark: { line, column } },
    );
  }

  if (!rawConfig || typeof rawConfig !== 'object' || Array.isArray(rawConfig)) {
    return failure('YAML did not produce a valid configuration object');
  }

  const appConfig = rawConfig as t.ConfigRecord;
  const result = configSchema.safeParse({ ...appConfig, version: '1.0.0' });
  if (!result.success) {
    return failure('Config validation failed', {
      validationErrors: result.error.errors.map(
        (e: { path: (string | number)[]; message: string }) => ({
          path: e.path.join('.'),
          message: e.message,
        }),
      ),
    });
  }

  return {
    success: true,
    appConfig,
    unknownPaths: findUnknownConfigPaths(appConfig),
  };
}

export const parseImportedYaml = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ yamlContent: z.string() }))
  .handler(async ({ data }: { data: { yamlContent: string } }) =>
    parseConfigYaml(data.yamlContent),
  );
