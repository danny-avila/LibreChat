import { interpolateBrandField } from '../brand';

describe('interpolateBrandField', () => {
  it('returns static strings unchanged', () => {
    expect(interpolateBrandField('Ask Gemini')).toBe('Ask Gemini');
  });

  it('substitutes a known token', () => {
    expect(interpolateBrandField('${modelName}', { modelName: 'Opus 4.8' })).toBe('Opus 4.8');
  });

  it('substitutes tokens embedded in surrounding text', () => {
    expect(interpolateBrandField('Model: ${modelName}', { modelName: 'Sonnet' })).toBe(
      'Model: Sonnet',
    );
  });

  it('leaves unknown/missing tokens intact (safer default, not emptied)', () => {
    expect(interpolateBrandField('Hi ${username}', {})).toBe('Hi ${username}');
  });

  it('resolves known tokens and leaves unknown ones in the same string', () => {
    expect(
      interpolateBrandField('${modelName} · ${planName}', { modelName: 'Grok' }),
    ).toBe('Grok · ${planName}');
  });

  it('passes null and undefined through unchanged', () => {
    expect(interpolateBrandField(null)).toBeNull();
    expect(interpolateBrandField(undefined)).toBeUndefined();
  });
});
