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

export function createLegacyPiiInspector(
  config: MessageFilterPiiConfig | undefined,
): LegacyPiiInspector | null {
  if (config == null) {
    return null;
  }
  return createPatternContentInspector(config);
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
