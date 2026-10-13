/**
 * 답변 끝 "검색 문서 리스트" 표의 『파일명』 → iManage 링크 치환 (2026-09-29).
 *
 * 스트리밍 답변에는 서버가 링크를 못 박으므로 클라이언트가 맵을 받아 바꾼다.
 * 표기 차이(OCR 파생 .md, NFD 한글, 공백)가 있어도 매칭되고, 이미 링크인
 * 자리는 이중 치환하지 않는지 검증한다.
 */
import {
  applyBklAnswerHyperlinks,
  hyperlinkMapFromSources,
  normalizeFileKey,
} from '../useBklAnswerHyperlinks';

const URL_A = 'https://km.bkl.co.kr/work/link/d/BKL!12345.1';
const URL_B = 'https://km.bkl.co.kr/work/link/d/BKL!67890.1';

describe('normalizeFileKey', () => {
  it('folds OCR .md suffix, NFD/NFC and surrounding whitespace', () => {
    expect(normalizeFileKey('계약서.pdf.md')).toBe(normalizeFileKey(' 계약서.pdf '));
    expect(normalizeFileKey('계약서.pdf'.normalize('NFD'))).toBe(normalizeFileKey('계약서.pdf'));
    expect(normalizeFileKey('Report.PDF')).toBe(normalizeFileKey('report.pdf'));
  });
});

describe('applyBklAnswerHyperlinks', () => {
  const lookup = new Map([
    [normalizeFileKey('계약서.pdf.md'), URL_A],
    [normalizeFileKey('의견서 (최종).docx'), URL_B],
  ]);

  it('links 『파일명』 cells in the document list table', () => {
    const text = [
      '## 검색 문서 리스트',
      '',
      '| # | 날짜 | 파일명 | 요약 | 인용 |',
      '|:-:|---|---|---|:-:|',
      '| 1 | 2024년 1월 | 『계약서.pdf』 | 핵심 | ○ |',
      '| 2 | 2023년 5월 | 『의견서 (최종).docx』 | 핵심 | ✗ |',
    ].join('\n');
    const out = applyBklAnswerHyperlinks(text, lookup);
    expect(out).toContain(`| [『계약서.pdf』](<${URL_A}>) |`);
    expect(out).toContain(`| [『의견서 (최종).docx』](<${URL_B}>) |`);
  });

  it('leaves unknown files and already-linked mentions untouched', () => {
    const text = `『모르는파일.pdf』 와 [『계약서.pdf』](${URL_A}) 참고`;
    expect(applyBklAnswerHyperlinks(text, lookup)).toBe(text);
  });

  it('is a no-op without a lookup or without any mention', () => {
    expect(applyBklAnswerHyperlinks('본문 『계약서.pdf』', null)).toBe('본문 『계약서.pdf』');
    expect(applyBklAnswerHyperlinks('본문만', lookup)).toBe('본문만');
  });
});

describe('hyperlinkMapFromSources', () => {
  it('builds file → iManage URL from the citation cache, preferring the first hit', () => {
    const map = hyperlinkMapFromSources([
      {
        document: ['a'],
        metadata: [{ name: '『계약서.pdf.md』- [1]', imanage_preview_url: URL_A }],
      },
      {
        document: ['b'],
        source: { imanage_url: URL_B },
        metadata: [{ name: '『계약서.pdf.md』- [2]' }],
      },
      { document: ['c'], metadata: [{ name: '『링크없음.pdf』- [3]' }] },
    ]);
    expect(map?.get(normalizeFileKey('계약서.pdf'))).toBe(URL_A);
    expect(map?.has(normalizeFileKey('링크없음.pdf'))).toBe(false);
  });

  it('returns null when the cache is empty', () => {
    expect(hyperlinkMapFromSources(undefined)).toBeNull();
    expect(hyperlinkMapFromSources([])).toBeNull();
  });
});
