import { logger } from '@librechat/data-schemas';
import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import type { ProtectionFinding, TextContentFragment } from '../types';

interface CompiledPattern {
  readonly id: string;
  readonly label: string;
  readonly pattern: RegExp;
}

export interface PatternContentInspector {
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

const STARTER_PATTERNS: readonly CompiledPattern[] = [
  { id: 'sk_prefix', label: 'sk- prefix token', pattern: /\b(sk-)[a-zA-Z0-9_-]+/g },
  { id: 'bearer_header', label: 'Bearer token', pattern: /\b(Bearer )[^\s"']+/gi },
  { id: 'api_key_header', label: 'api-key header', pattern: /\b(api-key:?\s+)[^\s"']+/gi },
];

const STARTER_BY_ID = new Map(STARTER_PATTERNS.map((pattern) => [pattern.id, pattern]));
const INSPECTOR_CACHE = new WeakMap<object, PatternContentInspector>();

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
          pattern.pattern.lastIndex = 0;
          if (!pattern.pattern.test(fragment.text)) {
            continue;
          }
          return {
            detectorId: 'legacy-pattern',
            ruleId: pattern.id,
            label: pattern.label,
            source: fragment.source,
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
  config: MessageFilterPiiConfig,
): PatternContentInspector {
  const cached = INSPECTOR_CACHE.get(config);
  if (cached != null) {
    return cached;
  }

  const starter = selectStarter(config.starterPatterns);
  const custom: CompiledPattern[] = [];
  for (const pattern of config.customPatterns ?? []) {
    try {
      custom.push({
        id: pattern.id,
        label: pattern.label,
        pattern: new RegExp(pattern.regex, 'g'),
      });
    } catch (error) {
      logger.warn(
        `[messageFilter.pii] dropping invalid customPattern ${JSON.stringify(pattern.id)}: ${(error as Error).message}`,
      );
    }
  }

  const compiled = [...starter, ...custom];
  const inspector = createInspector(compiled);
  INSPECTOR_CACHE.set(config, inspector);
  return inspector;
}
