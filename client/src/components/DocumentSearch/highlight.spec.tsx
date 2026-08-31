/**
 * 검색어 하이라이트 — 다중 검색어 (2026-08-31).
 *
 * 구분자를 공백만으로 잡던 탓에 `세종텔레콤, 아이즈비전` 이
 * `["세종텔레콤,", "아이즈비전"]` 으로 쪼개졌다. 쉼표가 붙은 앞 단어는
 * 본문과 절대 매칭되지 않아서 "맨 뒤 검색어만 칠해진다" 는 증상이 났다.
 * 검색 팁이 쉼표 표기를 안내하므로 흔한 입력이다.
 */
import React from 'react';
import { render } from '@testing-library/react';
import { highlight, queryTokens } from './ResultCard';

/** 실제로 <mark> 로 감싸진 텍스트만 모은다. */
function marked(text: string, query: string): string[] {
  const { container } = render(<div>{highlight(text, query)}</div>);
  return Array.from(container.querySelectorAll('mark')).map((m) => m.textContent ?? '');
}

describe('queryTokens', () => {
  it('쉼표로 구분한 검색어를 모두 분리한다', () => {
    expect(queryTokens('세종텔레콤, 아이즈비전').sort()).toEqual(
      ['세종텔레콤', '아이즈비전'].sort(),
    );
  });

  it('공백 구분도 그대로 동작한다', () => {
    expect(queryTokens('신세계 양주').sort()).toEqual(['신세계', '양주'].sort());
  });

  it('OR 구분자를 단어로 오인하지 않는다', () => {
    expect(queryTokens('합병 | 분할').sort()).toEqual(['합병', '분할'].sort());
  });

  it('근접 지정자 ~N 을 단어로 남기지 않는다', () => {
    // 남으면 본문의 모든 "5" 가 칠해진다.
    expect(queryTokens('"신탁 위반"~5')).not.toContain('5');
    expect(queryTokens('"신탁 위반"~5').sort()).toEqual(['신탁', '위반'].sort());
  });

  it('제외어(-단어)는 칠하지 않는다', () => {
    expect(queryTokens('주식매매 -우선주')).toEqual(['주식매매']);
  });

  it('인용부호를 벗겨 구문 안 단어를 각각 잡는다', () => {
    expect(queryTokens('"주주간 계약 해지"').sort()).toEqual(['주주간', '계약', '해지'].sort());
  });

  it('중복 검색어를 한 번만 남긴다', () => {
    expect(queryTokens('양주 양주 신세계')).toHaveLength(2);
  });

  it('긴 단어를 앞에 둔다', () => {
    // 짧은 쪽이 먼저 매칭되면 나머지 글자가 안 칠해진다.
    expect(queryTokens('삼성 삼성전자')[0]).toBe('삼성전자');
  });

  it('빈 검색어면 아무것도 없다', () => {
    expect(queryTokens('   ')).toEqual([]);
  });
});

describe('highlight', () => {
  it('쉼표로 구분한 검색어를 둘 다 칠한다', () => {
    const out = marked('세종텔레콤과 아이즈비전의 알뜰폰 계약', '세종텔레콤, 아이즈비전');
    expect(out).toEqual(['세종텔레콤', '아이즈비전']);
  });

  it('공백으로 구분한 검색어를 둘 다 칠한다', () => {
    expect(marked('신세계 양주 물류창고', '신세계 양주')).toEqual(['신세계', '양주']);
  });

  it('세 개 이상도 모두 칠한다', () => {
    expect(marked('가나 다라 마바 사아', '가나, 다라, 마바')).toEqual(['가나', '다라', '마바']);
  });

  it('영문 대소문자를 가리지 않는다', () => {
    expect(marked('Samsung and LG', 'samsung, lg')).toEqual(['Samsung', 'LG']);
  });

  it('제외어는 본문에 있어도 칠하지 않는다', () => {
    expect(marked('주식매매 우선주 계약', '주식매매 -우선주')).toEqual(['주식매매']);
  });

  it('근접 지정자의 숫자를 본문에서 칠하지 않는다', () => {
    expect(marked('신탁 위반 5건', '"신탁 위반"~5')).toEqual(['신탁', '위반']);
  });

  it('겹치는 검색어는 긴 쪽으로 칠한다', () => {
    expect(marked('삼성전자 실적', '삼성 삼성전자')).toEqual(['삼성전자']);
  });

  it('매칭이 없으면 아무것도 칠하지 않는다', () => {
    expect(marked('전혀 다른 내용', '신세계, 양주')).toEqual([]);
  });

  it('본문이 비면 안전하게 넘어간다', () => {
    expect(highlight('', '신세계')).toBeNull();
  });
});
