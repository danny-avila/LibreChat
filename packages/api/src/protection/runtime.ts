import type { FiltersConfig, MessageFilterPiiConfig } from 'librechat-data-provider';
import type { PatternContentInspector, PatternContentInspectorConfig } from './detectors/pattern';
import type { ContentSource, ProtectionFinding, TextContentFragment } from './types';
import type { ContentTraversalLimitError } from './adapters/nested';
import {
  getContentTraversalFragments,
  isContentTraversalLimitError,
  isContentTraversalProtected,
} from './adapters/nested';
import { createPatternContentInspector } from './detectors/pattern';
import { isLegacyPiiFragment } from './legacy';

interface CompiledFilter {
  readonly detectorId: string;
  readonly sources: ReadonlySet<ContentSource>;
  readonly fields: ReadonlySet<string> | null;
  readonly applies?: (fragment: TextContentFragment) => boolean;
  readonly inspector: PatternContentInspector;
}

export interface ContentInspectionConfig {
  readonly filters?: FiltersConfig;
  readonly legacyPii?: MessageFilterPiiConfig;
}

export interface ConfiguredContentInspector {
  createSession(): ConfiguredContentInspectionSession;
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

export interface ConfiguredContentInspectionSession {
  inspectFragment(fragment: TextContentFragment): ProtectionFinding | null;
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

export interface TraversalAwareContentInspectionConfig extends ContentInspectionConfig {
  readonly roles?: readonly (string | undefined)[];
}

export interface TraversalAwareContentInspectionResult {
  readonly finding: ProtectionFinding | null;
  readonly traversalError: ContentTraversalLimitError | null;
}

const FILTER_CACHE = new WeakMap<object, readonly CompiledFilter[]>();
const LEGACY_CACHE = new WeakMap<object, CompiledFilter | null>();
const FILTER_INSPECTOR_CACHE = new WeakMap<object, ConfiguredContentInspector>();
const LEGACY_INSPECTOR_CACHE = new WeakMap<object, ConfiguredContentInspector>();
const COMBINED_INSPECTOR_CACHE = new WeakMap<object, WeakMap<object, ConfiguredContentInspector>>();
const MAX_INSPECTION_DEDUPE_ENTRIES_PER_RULE = 4_096;

function compileFilter(
  config: PatternContentInspectorConfig & { readonly fields?: readonly string[] },
  sources: readonly ContentSource[],
): CompiledFilter | null {
  const inspector = createPatternContentInspector(config, { linearTime: true });
  if (!inspector.active) {
    return null;
  }
  return {
    detectorId: 'pii-pattern',
    sources: new Set(sources),
    fields: config.fields == null ? null : new Set(config.fields),
    inspector,
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
      const rule = compileFilter(config, sources);
      if (rule != null) {
        compiled.push(rule);
      }
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

function compileLegacy(config: MessageFilterPiiConfig): CompiledFilter | null {
  if (LEGACY_CACHE.has(config)) {
    return LEGACY_CACHE.get(config) ?? null;
  }
  const inspector = createPatternContentInspector(config, { linearTime: true });
  if (!inspector.active) {
    LEGACY_CACHE.set(config, null);
    return null;
  }
  const compiled: CompiledFilter = {
    detectorId: 'legacy-pattern',
    sources: new Set<ContentSource>(['message', 'assembled_context', 'tool_argument']),
    fields: null,
    applies: isLegacyPiiFragment,
    inspector,
  };
  LEGACY_CACHE.set(config, compiled);
  return compiled;
}

function createInspector(rules: readonly CompiledFilter[]): ConfiguredContentInspector {
  const rulesBySource = new Map<ContentSource, Array<readonly [number, CompiledFilter]>>();
  for (let ruleIndex = 0; ruleIndex < rules.length; ruleIndex++) {
    const rule = rules[ruleIndex];
    for (const source of rule.sources) {
      const sourceRules = rulesBySource.get(source);
      if (sourceRules == null) {
        rulesBySource.set(source, [[ruleIndex, rule]]);
      } else {
        sourceRules.push([ruleIndex, rule]);
      }
    }
  }

  const inspectFragment = (
    fragment: TextContentFragment,
    inspectedTextByRule: Array<Set<string> | undefined>,
  ): ProtectionFinding | null => {
    const sourceRules = rulesBySource.get(fragment.source);
    if (sourceRules == null) {
      return null;
    }
    for (const [ruleIndex, rule] of sourceRules) {
      if (rule.fields != null && !rule.fields.has(fragment.field)) {
        continue;
      }
      if (rule.applies?.(fragment) === false) {
        continue;
      }
      const inspectedText = (inspectedTextByRule[ruleIndex] ??= new Set<string>());
      if (inspectedText.has(fragment.text)) {
        continue;
      }
      if (inspectedText.size < MAX_INSPECTION_DEDUPE_ENTRIES_PER_RULE) {
        inspectedText.add(fragment.text);
      }
      const finding = rule.inspector.inspectFragment(fragment);
      if (finding != null) {
        return {
          ...finding,
          detectorId: rule.detectorId,
        };
      }
    }
    return null;
  };
  const inspect = (
    fragments: Iterable<TextContentFragment>,
    inspectedTextByRule: Array<Set<string> | undefined>,
  ): ProtectionFinding | null => {
    for (const fragment of fragments) {
      const finding = inspectFragment(fragment, inspectedTextByRule);
      if (finding != null) {
        return finding;
      }
    }
    return null;
  };
  const createSession = (): ConfiguredContentInspectionSession => {
    const inspectedTextByRule: Array<Set<string> | undefined> = new Array(rules.length);
    return {
      inspectFragment(fragment) {
        return inspectFragment(fragment, inspectedTextByRule);
      },
      inspect(fragments) {
        return inspect(fragments, inspectedTextByRule);
      },
    };
  };

  return {
    createSession,
    inspect(fragments) {
      return inspect(fragments, new Array(rules.length));
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
    const legacyRule = compileLegacy(legacyPii);
    const rules = [...(legacyRule == null ? [] : [legacyRule]), ...compileFilters(filters)];
    if (rules.length === 0) {
      return null;
    }
    const inspector = createInspector(rules);
    byLegacy.set(legacyPii, inspector);
    return inspector;
  }

  if (filters != null) {
    const cached = FILTER_INSPECTOR_CACHE.get(filters);
    if (cached != null) {
      return cached;
    }
    const rules = compileFilters(filters);
    if (rules.length === 0) {
      return null;
    }
    const inspector = createInspector(rules);
    FILTER_INSPECTOR_CACHE.set(filters, inspector);
    return inspector;
  }

  const legacy = legacyPii as MessageFilterPiiConfig;
  const cached = LEGACY_INSPECTOR_CACHE.get(legacy);
  if (cached != null) {
    return cached;
  }
  const legacyRule = compileLegacy(legacy);
  if (legacyRule == null) {
    return null;
  }
  const inspector = createInspector([legacyRule]);
  LEGACY_INSPECTOR_CACHE.set(legacy, inspector);
  return inspector;
}

export function inspectContent(
  fragments: Iterable<TextContentFragment>,
  config: ContentInspectionConfig,
): ProtectionFinding | null {
  return createConfiguredContentInspector(config)?.inspect(fragments) ?? null;
}

/** Inspects bounded extraction fragments before enforcing a protected traversal failure. */
export function inspectContentWithTraversal(
  extract: () => Iterable<TextContentFragment>,
  config: TraversalAwareContentInspectionConfig,
): TraversalAwareContentInspectionResult {
  const inspector = createConfiguredContentInspector(config);
  if (inspector == null) {
    return { finding: null, traversalError: null };
  }

  try {
    return { finding: inspector.inspect(extract()), traversalError: null };
  } catch (error) {
    if (!isContentTraversalLimitError(error)) {
      throw error;
    }
    const finding = inspector.inspect(getContentTraversalFragments(error));
    if (finding != null) {
      return { finding, traversalError: null };
    }
    const traversalError = isContentTraversalProtected({
      error,
      filters: config.filters,
      legacyPii: config.legacyPii,
      roles: config.roles,
    })
      ? error
      : null;
    return { finding: null, traversalError };
  }
}
