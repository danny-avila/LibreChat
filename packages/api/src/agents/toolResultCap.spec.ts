import { capToolOutput } from './handlers';

describe('capToolOutput', () => {
  it('leaves a result under the cap alone', () => {
    const output = { content: 'short' };

    expect(capToolOutput(output, 100)).toBe(0);
    expect(output.content).toBe('short');
  });

  it('leaves a result exactly at the cap alone', () => {
    const output = { content: 'x'.repeat(100) };

    expect(capToolOutput(output, 100)).toBe(0);
    expect(output.content).toHaveLength(100);
  });

  it('caps an oversized result and reports what it dropped', () => {
    const output = { content: 'x'.repeat(5_000) };

    const dropped = capToolOutput(output, 1_000);

    expect(output.content.length).toBeLessThanOrEqual(1_000);
    expect(dropped).toBe(5_000 - output.content.length);
  });

  it('tells the model the result was cut', () => {
    const output = { content: 'x'.repeat(5_000) };

    capToolOutput(output, 1_000);

    expect(output.content).toContain('truncated');
  });

  it('keeps the start and the end of the result', () => {
    const output = { content: `HEAD${'x'.repeat(5_000)}TAIL` };

    capToolOutput(output, 1_000);

    expect(output.content.startsWith('HEAD')).toBe(true);
    expect(output.content.endsWith('TAIL')).toBe(true);
  });

  it('is disabled at zero, which is the default', () => {
    const output = { content: 'x'.repeat(5_000) };

    expect(capToolOutput(output, 0)).toBe(0);
    expect(output.content).toHaveLength(5_000);
  });

  it('ignores output that is not a string', () => {
    const structured = { content: [{ type: 'text', text: 'x'.repeat(5_000) }] };

    expect(capToolOutput(structured, 10)).toBe(0);
    expect(Array.isArray(structured.content)).toBe(true);
  });

  it('ignores a missing or non-object output', () => {
    expect(capToolOutput(undefined, 10)).toBe(0);
    expect(capToolOutput(null, 10)).toBe(0);
    expect(capToolOutput('a string', 10)).toBe(0);
  });
});
