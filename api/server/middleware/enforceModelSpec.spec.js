// enforceModelSpec.test.js

const enforceModelSpec = require('./enforceModelSpec');

describe('enforceModelSpec function', () => {
  test('returns true when all model specs match parsed body directly', () => {
    const modelSpec = { preset: { title: 'Dialog', status: 'Active' } };
    const parsedBody = { title: 'Dialog', status: 'Active' };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(true);
  });

  test('returns true when model specs match via interchangeable keys', () => {
    const modelSpec = { preset: { chatGptLabel: 'GPT-4' } };
    const parsedBody = { modelLabel: 'GPT-4' };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(true);
  });

  test('returns false if any key value does not match', () => {
    const modelSpec = { preset: { language: 'English', level: 'Advanced' } };
    const parsedBody = { language: 'Spanish', level: 'Advanced' };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(false);
  });

  test('ignores the \'endpoint\' key in model spec', () => {
    const modelSpec = { preset: { endpoint: 'ignored', feature: 'Special' } };
    const parsedBody = { feature: 'Special' };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(true);
  });

  test('handles nested objects correctly', () => {
    const modelSpec = { preset: { details: { time: 'noon', location: 'park' } } };
    const parsedBody = { details: { time: 'noon', location: 'park' } };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(true);
  });

  test('handles arrays within objects', () => {
    const modelSpec = { preset: { tags: ['urgent', 'important'] } };
    const parsedBody = { tags: ['urgent', 'important'] };
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(true);
  });

  test('fails when arrays in objects do not match', () => {
    const modelSpec = { preset: { tags: ['urgent', 'important'] } };
    const parsedBody = { tags: ['important', 'urgent'] }; // Different order
    expect(enforceModelSpec(modelSpec, parsedBody)).toBe(false);
  });
});
