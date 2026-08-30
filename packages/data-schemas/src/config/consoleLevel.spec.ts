import { resolveConsoleLevel } from './utils';

describe('resolveConsoleLevel', () => {
  const original = process.env.CONSOLE_LOG_LEVEL;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.CONSOLE_LOG_LEVEL;
      return;
    }
    process.env.CONSOLE_LOG_LEVEL = original;
  });

  it('defaults to info and stays audible when unset', () => {
    delete process.env.CONSOLE_LOG_LEVEL;
    expect(resolveConsoleLevel()).toEqual({ level: 'info', silent: false });
  });

  it('honors an explicit level', () => {
    process.env.CONSOLE_LOG_LEVEL = 'error';
    expect(resolveConsoleLevel()).toEqual({ level: 'error', silent: false });
  });

  it('is case-insensitive', () => {
    process.env.CONSOLE_LOG_LEVEL = 'WARN';
    expect(resolveConsoleLevel()).toEqual({ level: 'warn', silent: false });
  });

  it('silences the transport without emitting an invalid winston level', () => {
    process.env.CONSOLE_LOG_LEVEL = 'silent';
    const { level, silent } = resolveConsoleLevel();
    expect(silent).toBe(true);
    expect(level).toBe('info');
  });

  it('keeps a caller-supplied fallback when silenced', () => {
    process.env.CONSOLE_LOG_LEVEL = 'silent';
    expect(resolveConsoleLevel('error')).toEqual({ level: 'error', silent: true });
  });
});
