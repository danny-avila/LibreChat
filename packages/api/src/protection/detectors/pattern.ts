import { logger } from '@librechat/data-schemas';
import type { MessageFilterPiiConfig, FilterPiiCustomPatternConfig } from 'librechat-data-provider';
import { RE2JS } from 're2js';
import type { ProtectionFinding, TextContentFragment } from '../types';

interface TestablePattern {
  test(input: string): boolean;
}

interface CompiledPattern {
  readonly id: string;
  readonly label: string;
  readonly pattern: TestablePattern;
}

export interface PatternContentInspector {
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

export interface PatternContentInspectorConfig {
  readonly starterPatterns?: readonly string[];
  readonly customPatterns?: readonly FilterPiiCustomPatternConfig[];
}

export interface PatternContentInspectorOptions {
  readonly linearTime?: boolean;
}

const STARTER_PATTERNS: readonly CompiledPattern[] = [
  { id: 'sk_prefix', label: 'sk- prefix token', pattern: /\b(sk-)[a-zA-Z0-9_-]+/ },
  { id: 'bearer_header', label: 'Bearer token', pattern: /\b(Bearer )[^\s"']+/i },
  { id: 'api_key_header', label: 'api-key header', pattern: /\b(api-key:?\s+)[^\s"']+/i },
];

const STARTER_BY_ID = new Map(STARTER_PATTERNS.map((pattern) => [pattern.id, pattern]));
const NATIVE_INSPECTOR_CACHE = new WeakMap<object, PatternContentInspector>();
const LINEAR_INSPECTOR_CACHE = new WeakMap<object, PatternContentInspector>();

function selectStarter(ids?: readonly string[]): readonly CompiledPattern[] {
  if (ids == null) {
    return STARTER_PATTERNS;
  }
  const selected: CompiledPattern[] = [];
  for (const id of ids) {
    const pattern = STARTER_BY_ID.get(id);
    if (pattern != null) {
      selected.push(pattern);
    }
  }
  return selected;
}

function createInspector(patterns: readonly CompiledPattern[]): PatternContentInspector {
  return {
    inspect(fragments) {
      if (patterns.length === 0) {
        return null;
      }

      for (const fragment of fragments) {
        for (const pattern of patterns) {
          if (!pattern.pattern.test(fragment.text)) {
            continue;
          }
          return {
            detectorId: 'legacy-pattern',
            ruleId: pattern.id,
            label: pattern.label,
            source: fragment.source,
            field: fragment.field,
            provenance: fragment.provenance,
            fragmentId: fragment.id,
            fragmentPath: fragment.path,
          };
        }
      }

      return null;
    },
  };
}

export function createPatternContentInspector(
  config: PatternContentInspectorConfig | MessageFilterPiiConfig,
  options: PatternContentInspectorOptions = {},
): PatternContentInspector {
  const cache = options.linearTime === true ? LINEAR_INSPECTOR_CACHE : NATIVE_INSPECTOR_CACHE;
  const cached = cache.get(config);
  if (cached != null) {
    return cached;
  }

  const starter = selectStarter(config.starterPatterns);
  const custom: CompiledPattern[] = [];
  for (const pattern of config.customPatterns ?? []) {
    if (options.linearTime === true) {
      custom.push({
        id: pattern.id,
        label: pattern.label,
        pattern: RE2JS.compile(pattern.regex),
      });
      continue;
    }
    try {
      custom.push({
        id: pattern.id,
        label: pattern.label,
        pattern: new RegExp(pattern.regex),
      });
    } catch (error) {
      logger.warn(
        `[messageFilter.pii] dropping invalid customPattern ${JSON.stringify(pattern.id)}: ${(error as Error).message}`,
      );
    }
  }

  const compiled = [...starter, ...custom];
  const inspector = createInspector(compiled);
  cache.set(config, inspector);
  return inspector;
}
