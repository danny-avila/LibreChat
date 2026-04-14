import {
  parseInput,
  parseOutput,
  parseErrorMessage,
  unwrapData,
  flattenObject,
  extractMetrics,
  formatJson,
  formatElapsed,
  formatBytes,
  formatValue,
  getRowLabel,
  formatCHC,
} from '../helpers';

describe('parseInput', () => {
  it('extracts query and params', () => {
    const result = parseInput('{"query":"SELECT 1","serviceId":"abc"}');
    expect(result.query).toBe('SELECT 1');
    expect(result.params).toEqual({ serviceId: 'abc' });
  });

  it('extracts sql alias', () => {
    const result = parseInput('{"sql":"SELECT 2"}');
    expect(result.query).toBe('SELECT 2');
  });

  it('returns empty params for invalid JSON', () => {
    const result = parseInput('not json');
    expect(result.query).toBeUndefined();
    expect(result.params).toEqual({});
  });
});

describe('parseOutput', () => {
  it('detects error in top-level', () => {
    const result = parseOutput('{"error":"something failed"}');
    expect(result.error).toBe(true);
    expect(result.errorMessage).toBe('something failed');
  });

  it('detects error in result.status', () => {
    const result = parseOutput('{"result":{"status":"error","message":"bad request"}}');
    expect(result.error).toBe(true);
    expect(result.errorMessage).toBe('bad request');
  });

  it('extracts rows from data array', () => {
    const result = parseOutput('{"result":{"data":[{"id":1,"name":"test"}],"rows":1,"statistics":{"elapsed":0.001,"rows_read":1,"bytes_read":10}}}');
    expect(result.error).toBe(false);
    expect(result.rows).toEqual([{ id: 1, name: 'test' }]);
    expect(result.metrics?.elapsed).toBe(0.001);
    expect(result.metrics?.rowsRead).toBe(1);
    expect(result.metrics?.bytesRead).toBe(10);
  });

  it('detects cost data', () => {
    const result = parseOutput('{"result":{"grandTotalCHC":10.5,"costs":[{"date":"2026-01-01","totalCHC":10.5}]}}');
    expect(result.costData).toBeDefined();
    expect(result.costData?.grandTotalCHC).toBe(10.5);
    expect(result.costData?.costs).toHaveLength(1);
  });

  it('wraps flat single object as row', () => {
    const result = parseOutput('{"result":{"status":"success","id":"abc","name":"test"}}');
    expect(result.rows).toEqual([{ id: 'abc', name: 'test' }]);
  });

  it('falls back to regex error detection', () => {
    const result = parseOutput('not json but has error in it');
    expect(result.error).toBe(true);
  });

  it('returns raw formatted JSON', () => {
    const result = parseOutput('{"result":{"status":"success","id":"abc"}}');
    expect(result.raw).toContain('"id": "abc"');
  });
});

describe('parseErrorMessage', () => {
  it('extracts error from embedded JSON', () => {
    const msg = 'HTTP 400: {"error":"BAD_REQUEST: fromDate is required","status":400}';
    expect(parseErrorMessage(msg)).toBe('400: BAD_REQUEST: fromDate is required');
  });

  it('returns original message if no JSON found', () => {
    expect(parseErrorMessage('plain error')).toBe('plain error');
  });

  it('returns original message if JSON parse fails', () => {
    expect(parseErrorMessage('HTTP 500: {invalid json}')).toBe('HTTP 500: {invalid json}');
  });
});

describe('unwrapData', () => {
  it('prefers data key', () => {
    const obj = { data: [{ id: 1 }], meta: [{ name: 'id' }] };
    expect(unwrapData(obj)).toEqual([{ id: 1 }]);
  });

  it('unwraps single array with few scalars', () => {
    const obj = { status: 'success', items: [{ id: 1 }] };
    expect(unwrapData(obj)).toEqual([{ id: 1 }]);
  });

  it('does not unwrap when many scalar fields exist', () => {
    const obj = { id: 'abc', name: 'test', region: 'us', endpoints: [{ host: 'x' }] };
    expect(unwrapData(obj)).toBe(obj);
  });
});

describe('flattenObject', () => {
  it('flattens nested objects with dot notation', () => {
    expect(flattenObject({ a: { b: 1, c: 2 } })).toEqual({ 'a.b': 1, 'a.c': 2 });
  });

  it('skips statistics and rows keys', () => {
    expect(flattenObject({ statistics: { elapsed: 1 }, rows: 5, name: 'test' })).toEqual({ name: 'test' });
  });

  it('preserves arrays as-is', () => {
    const result = flattenObject({ tags: [1, 2, 3] });
    expect(result.tags).toEqual([1, 2, 3]);
  });
});

describe('extractMetrics', () => {
  it('extracts from statistics object', () => {
    const result = extractMetrics({ statistics: { elapsed: 0.5, rows_read: 100, bytes_read: 1000 }, rows: 50 });
    expect(result).toEqual({ elapsed: 0.5, rowsRead: 100, bytesRead: 1000, totalRows: 50 });
  });

  it('returns undefined when no stats or rows', () => {
    expect(extractMetrics({ name: 'test' })).toBeUndefined();
  });
});

describe('formatJson', () => {
  it('pretty-prints valid JSON', () => {
    expect(formatJson('{"a":1}')).toBe('{\n  "a": 1\n}');
  });

  it('returns original string for invalid JSON', () => {
    expect(formatJson('not json')).toBe('not json');
  });
});

describe('formatElapsed', () => {
  it('formats microseconds', () => {
    expect(formatElapsed(0.0005)).toBe('500µs');
  });

  it('formats milliseconds', () => {
    expect(formatElapsed(0.15)).toBe('150.0ms');
  });

  it('formats seconds', () => {
    expect(formatElapsed(2.5)).toBe('2.500s');
  });
});

describe('formatBytes', () => {
  it('formats KB', () => {
    expect(formatBytes(1500)).toBe('1.50 KB');
  });

  it('formats MB', () => {
    expect(formatBytes(1500000)).toBe('1.50 MB');
  });

  it('formats GB', () => {
    expect(formatBytes(1500000000)).toBe('1.50 GB');
  });
});

describe('formatValue', () => {
  it('returns dash for null', () => {
    expect(formatValue(null)).toBe('—');
  });

  it('returns dash for undefined', () => {
    expect(formatValue(undefined)).toBe('—');
  });

  it('formats booleans', () => {
    expect(formatValue(true)).toBe('Yes');
    expect(formatValue(false)).toBe('No');
  });

  it('formats numbers with locale', () => {
    expect(formatValue(1000)).toMatch(/1.?000/);
  });

  it('formats ISO dates', () => {
    const result = formatValue('2026-06-15T12:00:00Z');
    expect(result).toContain('2026');
  });

  it('stringifies objects', () => {
    expect(formatValue({ a: 1 })).toBe('{"a":1}');
  });

  it('returns strings as-is', () => {
    expect(formatValue('hello')).toBe('hello');
  });
});

describe('getRowLabel', () => {
  it('prefers name', () => {
    expect(getRowLabel({ name: 'Test', id: 'abc' })).toBe('Test');
  });

  it('falls back to id', () => {
    expect(getRowLabel({ id: 'abc' })).toBe('abc');
  });

  it('returns Item as default', () => {
    expect(getRowLabel({ foo: 123 })).toBe('Item');
  });
});

describe('formatCHC', () => {
  it('formats zero', () => {
    expect(formatCHC(0)).toBe('0 CHC');
  });

  it('formats tiny values', () => {
    expect(formatCHC(0.0001)).toBe('<0.001 CHC');
  });

  it('formats normal values', () => {
    expect(formatCHC(10.5)).toMatch(/10.500 CHC/);
  });
});
