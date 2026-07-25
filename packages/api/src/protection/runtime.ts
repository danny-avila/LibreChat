import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { PatternContentInspectorConfig } from './detectors/pattern';
import type { ContentSource, ProtectionFinding, TextContentFragment } from './types';
import { createPatternContentInspector } from './detectors/pattern';
import { createLegacyPiiInspector, isLegacyPiiFragment } from './legacy';

interface CompiledFilter {
  readonly detectorId: string;
  readonly sources: ReadonlySet<ContentSource>;
  readonly fields: ReadonlySet<string> | null;
  readonly applies?: (fragment: TextContentFragment) => boolean;
  readonly inspector: ReturnType<typeof createPatternContentInspector>;
}

export interface ContentInspectionConfig {
  readonly filters?: FiltersConfig;
  readonly legacyPii?: MessageFilterPiiConfig;
}

export interface ConfiguredContentInspector {
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

const FILTER_CACHE = new WeakMap<object, readonly CompiledFilter[]>();
const LEGACY_CACHE = new WeakMap<object, CompiledFilter>();
const FILTER_INSPECTOR_CACHE = new WeakMap<object, ConfiguredContentInspector>();
const LEGACY_INSPECTOR_CACHE = new WeakMap<object, ConfiguredContentInspector>();
const COMBINED_INSPECTOR_CACHE = new WeakMap<object, WeakMap<object, ConfiguredContentInspector>>();

function compileFilter(
  config: PatternContentInspectorConfig & { readonly fields?: readonly string[] },
  sources: readonly ContentSource[],
): CompiledFilter {
  return {
    detectorId: 'pii-pattern',
    sources: new Set(sources),
    fields: config.fields == null ? null : new Set(config.fields),
    inspector: createPatternContentInspector(config, { linearTime: true }),
  };
}

function compileFilters(filters: FiltersConfig): readonly CompiledFilter[] {
  const cached = FILTER_CACHE.get(filters);
  if (cached != null) {
    return cached;
  }

  const compiled: CompiledFilter[] = [];
  const add = (
    config: (PatternContentInspectorConfig & { readonly fields?: readonly string[] }) | undefined,
    sources: readonly ContentSource[],
  ) => {
    if (config != null) {
      compiled.push(compileFilter(config, sources));
    }
  };

  add(filters.messages?.pii, ['message', 'assembled_context']);
  add(filters.prompts?.pii, ['prompt']);
  add(filters.agentInstructions?.pii, ['agent_instruction']);
  add(filters.conversationStarters?.pii, ['conversation_starter']);
  add(filters.skills?.pii, ['skill']);
  add(filters.memories?.pii, ['memory']);
  add(filters.files?.pii, ['file']);
  add(filters.toolArguments?.pii, ['tool_argument']);
  add(filters.modelParameters?.pii, ['model_parameter']);
  add(filters.actionMetadata?.pii, ['action_metadata']);
  add(filters.feedback?.pii, ['feedback']);
  add(filters.conversationTitles?.pii, ['conversation_title']);

  FILTER_CACHE.set(filters, compiled);
  return compiled;
}

function compileLegacy(config: MessageFilterPiiConfig): CompiledFilter {
  const cached = LEGACY_CACHE.get(config);
  if (cached != null) {
    return cached;
  }
  const compiled: CompiledFilter = {
    detectorId: 'legacy-pattern',
    sources: new Set<ContentSource>(['message', 'assembled_context', 'tool_argument']),
    fields: null,
    applies: isLegacyPiiFragment,
    inspector: createLegacyPiiInspector(config)!,
  };
  LEGACY_CACHE.set(config, compiled);
  return compiled;
}

function createInspector(rules: readonly CompiledFilter[]): ConfiguredContentInspector {
  return {
    inspect(fragments) {
      const inspectedTextByRule = rules.map(() => new Set<string>());
      for (const fragment of fragments) {
        for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
          const rule = rules[ruleIndex];
          if (!rule.sources.has(fragment.source)) {
            continue;
          }
          if (rule.fields != null && !rule.fields.has(fragment.field)) {
            continue;
          }
          if (rule.applies?.(fragment) === false) {
            continue;
          }
          const inspectedText = inspectedTextByRule[ruleIndex];
          if (inspectedText.has(fragment.text)) {
            continue;
          }
          inspectedText.add(fragment.text);
          const finding = rule.inspector.inspect([fragment]);
          if (finding != null) {
            return {
              ...finding,
              detectorId: rule.detectorId,
            };
          }
        }
      }
      return null;
    },
  };
}

export function createConfiguredContentInspector(
  config: ContentInspectionConfig,
): ConfiguredContentInspector | null {
  const { filters, legacyPii } = config;
  if (filters == null && legacyPii == null) {
    return null;
  }

  if (filters != null && legacyPii != null) {
    let byLegacy = COMBINED_INSPECTOR_CACHE.get(filters);
    if (byLegacy == null) {
      byLegacy = new WeakMap<object, ConfiguredContentInspector>();
      COMBINED_INSPECTOR_CACHE.set(filters, byLegacy);
    }
    const cached = byLegacy.get(legacyPii);
    if (cached != null) {
      return cached;
    }
    const inspector = createInspector([compileLegacy(legacyPii), ...compileFilters(filters)]);
    byLegacy.set(legacyPii, inspector);
    return inspector;
  }

  if (filters != null) {
    const cached = FILTER_INSPECTOR_CACHE.get(filters);
    if (cached != null) {
      return cached;
    }
    const inspector = createInspector(compileFilters(filters));
    FILTER_INSPECTOR_CACHE.set(filters, inspector);
    return inspector;
  }

  const legacy = legacyPii as MessageFilterPiiConfig;
  const cached = LEGACY_INSPECTOR_CACHE.get(legacy);
  if (cached != null) {
    return cached;
  }
  const inspector = createInspector([compileLegacy(legacy)]);
  LEGACY_INSPECTOR_CACHE.set(legacy, inspector);
  return inspector;
}

export function inspectContent(
  fragments: Iterable<TextContentFragment>,
  config: ContentInspectionConfig,
): ProtectionFinding | null {
  return createConfiguredContentInspector(config)?.inspect(fragments) ?? null;
}
