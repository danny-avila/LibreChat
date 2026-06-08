export type PiiPatternMatch = {
  patternId: string;
  patternLabel: string;
  count: number;
};

export type PiiEvent = {
  type: 'pii_matches';
  matches?: PiiPatternMatch[];
};

const dedupeLabels = (matches: PiiPatternMatch[]): string[] => {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const match of matches) {
    const label = match?.patternLabel?.trim();
    if (!label || seen.has(label)) {
      continue;
    }
    seen.add(label);
    labels.push(label);
  }
  return labels;
};

export const formatPiiLabels = (matches?: PiiPatternMatch[]): string => {
  if (!matches || matches.length === 0) {
    return '';
  }
  return dedupeLabels(matches).join(', ');
};
