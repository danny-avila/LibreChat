import { RE2JS } from 're2js';
import { logger } from '@librechat/data-schemas';
import { MAX_PII_CUSTOM_REGEX_INSTRUCTIONS } from 'librechat-data-provider';
import type { MessageFilterPiiConfig, FilterPiiCustomPatternConfig } from 'librechat-data-provider';
import type { ProtectionFinding, TextContentFragment } from '../types';

interface TestablePattern {
  test(input: string): boolean;
}

interface CompiledPattern {
  readonly id: string;
  readonly label: string;
  readonly pattern: TestablePattern;
}

class PatternProgramLimitError extends Error {}

export interface PatternContentInspector {
  readonly active: boolean;
  inspectFragment(fragment: TextContentFragment): ProtectionFinding | null;
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
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    const pattern = STARTER_BY_ID.get(id);
    if (pattern != null) {
      selected.push(pattern);
    }
  }
  return selected;
}

function createInspector(patterns: readonly CompiledPattern[]): PatternContentInspector {
  const inspectFragment = (fragment: TextContentFragment): ProtectionFinding | null => {
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
    return null;
  };

  return {
    active: patterns.length > 0,
    inspectFragment,
    inspect(fragments) {
      for (const fragment of fragments) {
        const finding = inspectFragment(fragment);
        if (finding != null) {
          return finding;
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
  const customSignatures = new Set<string>();
  let customProgramInstructions = 0;
  for (const pattern of config.customPatterns ?? []) {
    const signature = JSON.stringify([pattern.id, pattern.label, pattern.regex]);
    if (customSignatures.has(signature)) {
      continue;
    }
    customSignatures.add(signature);
    try {
      const compiledPattern =
        options.linearTime === true ? RE2JS.compile(pattern.regex) : new RegExp(pattern.regex);
      if (compiledPattern instanceof RE2JS) {
        customProgramInstructions += compiledPattern.programSize();
        if (customProgramInstructions > MAX_PII_CUSTOM_REGEX_INSTRUCTIONS) {
          compiledPattern.reset();
          for (const compiled of custom) {
            if (compiled.pattern instanceof RE2JS) {
              compiled.pattern.reset();
            }
          }
          throw new PatternProgramLimitError(
            `custom patterns exceed ${MAX_PII_CUSTOM_REGEX_INSTRUCTIONS} compiled instructions`,
          );
        }
      }
      custom.push({
        id: pattern.id,
        label: pattern.label,
        pattern: compiledPattern,
      });
    } catch (error) {
      if (error instanceof PatternProgramLimitError) {
        throw error;
      }
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
