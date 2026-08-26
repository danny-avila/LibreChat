import { TextDecoder } from 'util';
import {
  BKL_QUERY_CHOICES_PENDING_TEXT,
  BKL_QUERY_CHOICES_READY_TEXT,
  getBklDisplayText,
  parseBklQueryChoices,
  stripBklTags,
  stripDoubleMdForDisplay,
} from '../bklFilter';

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

  it('strips partial streaming BKL query choices control tags', () => {
    const text = '[BKL_QUERY_CHOICES:eyJjYW5kaWRhdGVzIjpb';

    expect(stripBklTags(text)).toBe('');
  });

  it('shows user-facing placeholders for BKL query choice messages', () => {
    expect(getBklDisplayText('[BKL_QUERY_CHOICES:eyJjYW5kaWRhdGVzIjpbXX0=]')).toBe(
      BKL_QUERY_CHOICES_READY_TEXT,
    );
    expect(getBklDisplayText('[BKL_QUERY_CHOICES:eyJjYW5kaWRhdGVzIjpb')).toBe(
      BKL_QUERY_CHOICES_PENDING_TEXT,
    );
  });

  it('parses BKL query choices payloads for the A/B/C panel', () => {
    const payload = {
      candidates: [{ id: 'a', query: '삼성디스플레이 중대재해 자문', rationale: '자문 중심' }],
      chunks_used: 3,
    };
    const encoded = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');

    expect(parseBklQueryChoices(`[BKL_QUERY_CHOICES:${encoded}]`)).toEqual(payload);
  });

  describe('stripDoubleMdForDisplay — 본문 이중확장자 .md 표시 제거', () => {
    it('strips OCR-derived .md in prose and tables', () => {
      expect(stripDoubleMdForDisplay('『계약서.pdf.md』를 참고')).toBe('『계약서.pdf』를 참고');
      expect(stripDoubleMdForDisplay('| 1 | 신청서 보완1차.hwp.md | 요약 |')).toBe(
        '| 1 | 신청서 보완1차.hwp | 요약 |',
      );
      expect(stripDoubleMdForDisplay('별지.docx.MD 와 메일.msg.markdown')).toBe(
        '별지.docx 와 메일.msg',
      );
    });

    it('keeps genuine .md filenames (single extension)', () => {
      expect(stripDoubleMdForDisplay('README.md 파일 참고')).toBe('README.md 파일 참고');
    });

    it('does not touch markdown link URLs', () => {
      const text = '[[1]](https://viewer/doc?f=계약서.pdf.md) 그리고 계약서.pdf.md 본문';
      expect(stripDoubleMdForDisplay(text)).toBe(
        '[[1]](https://viewer/doc?f=계약서.pdf.md) 그리고 계약서.pdf 본문',
      );
    });

    it('is applied by getBklDisplayText', () => {
      expect(getBklDisplayText('의견서.pptx.md 참조')).toBe('의견서.pptx 참조');
    });
  });
});
