import type { ScoreAnswer, ChoiceAnswer, BooleanAnswer } from './types';
import {
  score,
  level,
  label,
  choice,
  isTrue,
  ranked,
  boolean,
  normalized,
  probabilityOf,
} from './questions';

describe('question builders', () => {
  it('builds a boolean without criteria', () => {
    expect(boolean('Is this urgent?')).toEqual({
      type: 'boolean',
      instructions: 'Is this urgent?',
    });
  });

  it('builds a boolean with criteria', () => {
    expect(boolean('Is this urgent?', { true: 'yes means', false: 'no means' })).toEqual({
      type: 'boolean',
      instructions: 'Is this urgent?',
      criteria: { true: 'yes means', false: 'no means' },
    });
  });

  it('builds a choice and a score', () => {
    expect(choice('Which team?', { billing: 'money', tech: 'bugs' })).toEqual({
      type: 'choice',
      instructions: 'Which team?',
      criteria: { billing: 'money', tech: 'bugs' },
    });
    expect(score('How angry?', ['Calm', 'Cross', 'Furious'])).toEqual({
      type: 'score',
      instructions: 'How angry?',
      criteria: ['Calm', 'Cross', 'Furious'],
    });
  });
});

describe('isTrue', () => {
  const answer: BooleanAnswer = { type: 'boolean', probability: 0.8 };

  it('compares against the threshold inclusively', () => {
    expect(isTrue(answer, 0.8)).toBe(true);
    expect(isTrue(answer, 0.81)).toBe(false);
  });

  it('is false for a missing answer', () => {
    expect(isTrue(undefined, 0)).toBe(false);
  });
});

describe('choice helpers', () => {
  const answer: ChoiceAnswer = {
    type: 'choice',
    choice: 'tech',
    confidence: 0.7,
    probabilities: { tech: 0.7, billing: 0.2, sales: 0.05 },
  };

  it('reads one option probability', () => {
    expect(probabilityOf(answer, 'billing')).toBeCloseTo(0.2);
  });

  it('returns zero for an option that was never offered', () => {
    expect(probabilityOf(answer, 'absent')).toBe(0);
  });

  it('ranks options most probable first', () => {
    expect(ranked(answer)).toEqual(['tech', 'billing', 'sales']);
  });

  it('drops options under the floor', () => {
    expect(ranked(answer, 0.1)).toEqual(['tech', 'billing']);
  });

  it('handles a missing answer', () => {
    expect(ranked(undefined)).toEqual([]);
  });
});

describe('score helpers', () => {
  const levels = ['Calm', 'Frustrated', 'Very angry'];
  const answer: ScoreAnswer = {
    type: 'score',
    score: 1.24,
    confidence: 0.6,
    probabilities: { '0': 0.12, '1': 0.52, '2': 0.36 },
  };

  it('reports the most probable level, not the rounded score', () => {
    expect(level(answer)).toBe(1);
  });

  it('labels that level', () => {
    expect(label(answer, levels)).toBe('Frustrated');
  });

  it('returns an empty label when the levels do not cover it', () => {
    expect(label(answer, ['only one'])).toBe('');
  });

  it('normalizes the weighted score against the top level', () => {
    expect(normalized(answer, levels.length)).toBeCloseTo(0.62);
  });

  it('clamps a score outside the level range', () => {
    expect(normalized({ ...answer, score: 99 }, levels.length)).toBe(1);
    expect(normalized({ ...answer, score: -1 }, levels.length)).toBe(0);
  });

  it('returns zero when there are too few levels to normalize', () => {
    expect(normalized(answer, 1)).toBe(0);
  });

  it('handles a missing answer', () => {
    expect(level(undefined)).toBe(0);
    expect(normalized(undefined, 3)).toBe(0);
  });
});
