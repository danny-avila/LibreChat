import { TextDecoder } from 'util';
import { parseBklQueryChoices, stripBklTags } from '../bklFilter';

describe('bklFilter', () => {
  const originalAtob = globalThis.atob;
  const originalTextDecoder = globalThis.TextDecoder;

  beforeAll(() => {
    Object.defineProperty(globalThis, 'atob', {
      configurable: true,
      value: (input: string) => Buffer.from(input, 'base64').toString('binary'),
    });
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: TextDecoder,
    });
  });

  afterAll(() => {
    Object.defineProperty(globalThis, 'atob', {
      configurable: true,
      value: originalAtob,
    });
    Object.defineProperty(globalThis, 'TextDecoder', {
      configurable: true,
      value: originalTextDecoder,
    });
  });

  it('strips BKL query choices control tags from display text', () => {
    const text = '[BKL_QUERY_CHOICES:eyJjYW5kaWRhdGVzIjpbXX0=]';

    expect(stripBklTags(text)).toBe('');
  });

  it('parses BKL query choices payloads for the A/B/C panel', () => {
    const payload = {
      candidates: [{ id: 'a', query: '삼성디스플레이 중대재해 자문', rationale: '자문 중심' }],
      chunks_used: 3,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');

    expect(parseBklQueryChoices(`[BKL_QUERY_CHOICES:${encoded}]`)).toEqual(payload);
  });
});
