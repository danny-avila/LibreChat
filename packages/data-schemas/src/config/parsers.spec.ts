import { debugTraverse, redactFormat, redactMessage } from './parsers';

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');

type FormatterInfo = Record<string | symbol, unknown> & {
  level: string;
  message: string;
  timestamp: string;
};

type RedactInfo = Record<string | symbol, unknown> & {
  level: string;
  message: string;
};

function runRedactFormat(info: RedactInfo): RedactInfo {
  return (redactFormat().transform(info) || info) as RedactInfo;
}

function runFormatter(info: FormatterInfo): string {
  const transformed = debugTraverse.transform(info);
  if (transformed && typeof transformed === 'object') {
    const message = (transformed as Record<string | symbol, unknown>)[MESSAGE_SYMBOL];
    return typeof message === 'string' ? message : String(transformed);
  }
  return String(transformed);
}

function buildInfo(level: string, meta: Record<string, unknown>): FormatterInfo {
  return {
    level,
    message: 'test',
    timestamp: 'ts',
    ...meta,
    [SPLAT_SYMBOL]: [meta],
  };
}

describe('redactMessage', () => {
  it('redacts sensitive token patterns anywhere in a message', () => {
    expect(redactMessage('token: sk-abc123def')).toBe('token: sk-[REDACTED]');
    expect(redactMessage('auth Bearer secretvalue')).toBe('auth Bearer [REDACTED]');
    expect(redactMessage('api-key: secretvalue')).toBe('api-key: [REDACTED]');
    expect(redactMessage('https://example.test/?key=secretvalue&next=true')).toBe(
      'https://example.test/?key=[REDACTED]&next=true',
    );
  });

  it('does not redact ordinary words containing sensitive prefixes', () => {
    expect(redactMessage('task-runner failed')).toBe('task-runner failed');
    expect(redactMessage('mask-value computed')).toBe('mask-value computed');
    expect(redactMessage('monkey=10 bananas')).toBe('monkey=10 bananas');
  });
});

describe('redactFormat', () => {
  it.each(['error', 'warn', 'info', 'debug'])('redacts info.message for %s level', (level) => {
    const info = runRedactFormat({ level, message: 'Bearer secretvalue' });
    expect(info.message).toBe('Bearer [REDACTED]');
  });

  it('redacts the winston message symbol', () => {
    const info = runRedactFormat({
      level: 'info',
      message: 'visible',
      [MESSAGE_SYMBOL]: 'token: sk-abc123def',
    });

    expect(info[MESSAGE_SYMBOL]).toBe('token: sk-[REDACTED]');
  });
});

describe('debugTraverse request context', () => {
  it('appends request context metadata for non-debug lines', () => {
    const out = runFormatter(
      buildInfo('info', {
        tenantId: 'tenant-1',
        userId: 'user-1',
        requestId: 'req-1',
      }),
    );

    expect(out).toContain('"tenantId":"tenant-1"');
    expect(out).toContain('"userId":"user-1"');
    expect(out).toContain('"requestId":"req-1"');
  });

  it('does not append the system tenant sentinel as tenantId', () => {
    const out = runFormatter(
      buildInfo('info', {
        tenantId: '__SYSTEM__',
        userId: 'user-1',
        requestId: 'req-1',
      }),
    );

    expect(out).not.toContain('__SYSTEM__');
    expect(out).not.toContain('"tenantId"');
    expect(out).toContain('"userId":"user-1"');
    expect(out).toContain('"requestId":"req-1"');
  });

  it('omits the system tenant sentinel from debug object metadata', () => {
    const out = runFormatter(
      buildInfo('debug', {
        tenantId: '__SYSTEM__',
        userId: 'user-1',
      }),
    );

    expect(out).not.toContain('__SYSTEM__');
    expect(out).not.toMatch(/tenantId:/);
    expect(out).toContain('userId');
  });
});
