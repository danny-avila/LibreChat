import { resolveModel } from './models';

describe('resolveModel', () => {
  it('renders minor versions with a dot', () => {
    expect(resolveModel('gpt-5-5-thinking', 'gpt-4o')).toEqual({
      model: 'gpt-5-5-thinking',
      sender: 'GPT-5.5 Thinking',
    });
    expect(resolveModel('gpt-4-1', 'gpt-4o')).toEqual({
      model: 'gpt-4-1',
      sender: 'GPT-4.1',
    });
  });

  it('keeps single-segment versions unchanged', () => {
    expect(resolveModel('gpt-5', 'gpt-4o').sender).toBe('GPT-5');
    expect(resolveModel('gpt-4o', 'gpt-4o').sender).toBe('GPT-4o');
    expect(resolveModel('gpt-4o-mini', 'gpt-4o').sender).toBe('GPT-4o mini');
  });

  it('handles reasoning families that are not gpt-prefixed', () => {
    expect(resolveModel('o3', 'gpt-4o').sender).toBe('o3');
    expect(resolveModel('o4-mini-high', 'gpt-4o').sender).toBe('o4-mini-high');
  });

  it('maps the deep research slug', () => {
    expect(resolveModel('research', 'gpt-4o').sender).toBe('Deep Research');
  });

  it('falls back when the slug is missing', () => {
    expect(resolveModel(undefined, 'gpt-4o')).toEqual({
      model: 'gpt-4o',
      sender: 'GPT-4o',
    });
  });

  it('does not crash on an unknown slug', () => {
    expect(resolveModel('some-future-model', 'gpt-4o')).toEqual({
      model: 'some-future-model',
      sender: 'some-future-model',
    });
  });
});
