import { debugTraverse } from './parsers';

const SPLAT_SYMBOL = Symbol.for('splat');
const MESSAGE_SYMBOL = Symbol.for('message');

type FormatterInfo = Record<string | symbol, unknown> & {
  level: string;
  message: string;
  timestamp: string;
};

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
