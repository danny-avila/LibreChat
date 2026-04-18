import type { DeepPartial, TCustomConfig } from 'librechat-data-provider';
import { loadSummarizationConfig } from './service';
import logger from '~/config/winston';

jest.mock('~/config/winston', () => ({
  __esModule: true,
  default: {
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('loadSummarizationConfig', () => {
  const warnSpy = logger.warn as jest.Mock;

  beforeEach(() => {
    warnSpy.mockClear();
  });

  it('returns undefined when no summarization config is provided', () => {
    expect(loadSummarizationConfig({} as DeepPartial<TCustomConfig>)).toBeUndefined();
  });

  it('accepts a valid token_ratio trigger', () => {
    const result = loadSummarizationConfig({
      summarization: {
        enabled: true,
        trigger: { type: 'token_ratio', value: 0.8 },
      },
    } as DeepPartial<TCustomConfig>);

    expect(result).toBeDefined();
    expect(result?.enabled).toBe(true);
    expect(result?.trigger).toEqual({ type: 'token_ratio', value: 0.8 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits a targeted migration warning when trigger.type is the legacy "token_count"', () => {
    const result = loadSummarizationConfig({
      summarization: {
        trigger: { type: 'token_count', value: 8000 },
      },
    } as unknown as DeepPartial<TCustomConfig>);

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const message = String(warnSpy.mock.calls[0][0]);
    expect(message).toContain('token_count');
    expect(message).toContain('token_ratio');
    expect(message).toContain('remaining_tokens');
    expect(message).toContain('messages_to_refine');
    expect(message).toContain('fall back');
  });

  it('falls back to the generic warning when trigger is a bare string (not an object)', () => {
    const result = loadSummarizationConfig({
      summarization: {
        trigger: 'token_count',
      },
    } as unknown as DeepPartial<TCustomConfig>);

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('Invalid summarization config');
  });

  it('falls back to the generic warning for other schema violations', () => {
    const result = loadSummarizationConfig({
      summarization: {
        trigger: { type: 'token_ratio', value: 80 },
      },
    } as unknown as DeepPartial<TCustomConfig>);

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('Invalid summarization config');
  });
});
