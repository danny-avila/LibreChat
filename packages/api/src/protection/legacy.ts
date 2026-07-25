import type { MessageFilterPiiConfig } from 'librechat-data-provider';
import type { ProtectionFinding, TextContentFragment } from './types';
import { createPatternContentInspector } from './detectors/pattern';

export interface LegacyPiiMatch {
  readonly id: string;
  readonly label: string;
}

export interface LegacyPiiInspector {
  inspect(fragments: Iterable<TextContentFragment>): ProtectionFinding | null;
}

const LEGACY_INSPECTOR_CACHE = new WeakMap<object, LegacyPiiInspector>();

export function isLegacyPiiFragment(fragment: TextContentFragment): boolean {
  if (fragment.source === 'assembled_context' && fragment.id === 'chat.assembled.quote-text') {
    return true;
  }
  if (fragment.source === 'tool_argument') {
    return /^chat\.decision\.\d+\.arguments$/.test(fragment.id);
  }
  if (fragment.source !== 'message') {
    return false;
  }
  return (
    fragment.id === 'chat.text' ||
    fragment.id === 'chat.answer' ||
    /^chat\.quote\.\d+$/.test(fragment.id) ||
    /^chat\.decision\.\d+\.(?:response|reason)$/.test(fragment.id) ||
    /^external-message\.\d+\.(?:content|part\.\d+)$/.test(fragment.id)
  );
}

export function createLegacyPiiInspector(
  config: MessageFilterPiiConfig | undefined,
): LegacyPiiInspector | null {
  if (config == null) {
    return null;
  }
  const cached = LEGACY_INSPECTOR_CACHE.get(config);
  if (cached != null) {
    return cached;
  }
  const patternInspector = createPatternContentInspector(config);
  const inspector: LegacyPiiInspector = {
    inspect(fragments) {
      return patternInspector.inspect(
        (function* legacyFragments() {
          for (const fragment of fragments) {
            if (isLegacyPiiFragment(fragment)) {
              yield fragment;
            }
          }
        })(),
      );
    },
  };
  LEGACY_INSPECTOR_CACHE.set(config, inspector);
  return inspector;
}

export function inspectLegacyPii(
  fragments: Iterable<TextContentFragment>,
  config: MessageFilterPiiConfig | undefined,
): ProtectionFinding | null {
  return createLegacyPiiInspector(config)?.inspect(fragments) ?? null;
}

export function toLegacyPiiMatch(finding: ProtectionFinding | null): LegacyPiiMatch | null {
  if (finding == null) {
    return null;
  }
  return {
    id: finding.ruleId,
    label: finding.label,
  };
}
