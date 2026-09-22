import type {
  ScoreAnswer,
  ChoiceAnswer,
  ScoreQuestion,
  BooleanAnswer,
  ChoiceQuestion,
  BooleanQuestion,
  ClassificationText,
} from './types';

export function boolean(
  instructions: ClassificationText,
  criteria?: { true?: ClassificationText; false?: ClassificationText },
): BooleanQuestion {
  return criteria == null
    ? { type: 'boolean', instructions }
    : { type: 'boolean', instructions, criteria };
}

export function choice(
  instructions: ClassificationText,
  criteria: Record<string, ClassificationText | null>,
): ChoiceQuestion {
  return { type: 'choice', instructions, criteria };
}

export function score(
  instructions: ClassificationText,
  levels: ClassificationText[],
): ScoreQuestion {
  return { type: 'score', instructions, criteria: levels };
}

export function isTrue(answer: BooleanAnswer | undefined, threshold: number): boolean {
  return answer != null && answer.probability >= threshold;
}

export function probabilityOf(
  answer: ChoiceAnswer | ScoreAnswer | undefined,
  option: string,
): number {
  return answer?.probabilities?.[option] ?? 0;
}

/** Options above `floor`, most probable first. */
export function ranked(answer: ChoiceAnswer | undefined, floor = 0): string[] {
  if (answer == null) {
    return [];
  }
  return Object.entries(answer.probabilities)
    .filter(([, probability]) => probability >= floor)
    .sort((a, b) => b[1] - a[1])
    .map(([option]) => option);
}

/** The most probable level, which is not always the rounded weighted score. */
export function level(answer: ScoreAnswer | undefined): number {
  if (answer == null) {
    return 0;
  }
  let best = 0;
  let bestProbability = -1;
  for (const [key, probability] of Object.entries(answer.probabilities)) {
    if (probability > bestProbability) {
      bestProbability = probability;
      best = Number(key);
    }
  }
  return Number.isFinite(best) ? best : 0;
}

export function label(answer: ScoreAnswer | undefined, levels: readonly string[]): string {
  return levels[level(answer)] ?? '';
}

/** The weighted score as a fraction of the highest level. */
export function normalized(answer: ScoreAnswer | undefined, levelCount: number): number {
  if (answer == null || levelCount < 2) {
    return 0;
  }
  return Math.min(Math.max(answer.score / (levelCount - 1), 0), 1);
}
