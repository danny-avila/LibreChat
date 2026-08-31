/**
 * 문서 검색 페이지네이션 + 100건 초과 안내 (2026-08-31).
 *
 * 상한을 50 → 100 으로 올리면서 10건씩 끊어 보여준다. 안내 배너는
 * "상한에서 실제로 잘렸을 때"만 떠야 한다 — total_hit_count 는 서버측
 * 필터·ACL 이전 근사값이라 그것만 보고 띄우면 결과를 다 보여준 경우에도
 * "더 있다" 고 거짓말을 한다.
 *
 * 무거운 자식·훅은 스텁으로 바꾸고, 슬라이싱·페이지 리셋·안내 조건 같은
 * 이 컴포넌트 자체의 로직만 실제로 돌린다.
 */
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { DocumentHit, KeywordSearchResponse } from '~/data-provider/DocumentSearch';

// jest.mock 팩토리는 호이스팅되므로 스코프 밖 변수를 못 읽는다.
// `mock` 접두사가 붙은 이름만 예외로 허용된다.
const mockMutate = jest.fn();
const mockReset = jest.fn();
let mockSearchState: {
  data?: KeywordSearchResponse;
  isLoading: boolean;
  isError: boolean;
  error?: Error;
};

jest.mock('~/data-provider/DocumentSearch', () => ({
  __esModule: true,
  useDocumentKeywordSearch: () => ({
    ...mockSearchState,
    mutate: mockMutate,
    reset: mockReset,
  }),
}));

jest.mock('react-router-dom', () => ({
  __esModule: true,
  // ?q= 가 있어야 결과 화면이 그려진다. 비면 검색 힌트 패널로 떨어진다.
  useSearchParams: () => [new URLSearchParams('q=테스트'), jest.fn()],
  useOutletContext: () => ({ navVisible: true, setNavVisible: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  __esModule: true,
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('~/Providers', () => ({
  __esModule: true,
  useChatContext: () => ({ conversation: null, newConversation: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  __esModule: true,
  useDocumentTitle: () => undefined,
  // 실제 문구 대신 키를 그대로 돌려주면 단정이 로케일 변경에 흔들리지 않는다.
  useLocalize: () => (key: string, vars?: Record<string, string>) =>
    vars ? `${key}:${Object.values(vars).join(',')}` : key,
}));

jest.mock('@librechat/client', () => ({
  __esModule: true,
  TooltipAnchor: ({ render: r }: { render: React.ReactNode }) => <>{r}</>,
  Button: ({ children, ...p }: any) => <button {...p}>{children}</button>,
  NewChatIcon: () => <span />,
  useMediaQuery: () => false,
  // HoverCard 는 Radix 라 열기 전엔 내용이 없다. 트리거 표식이 붙었는지만
  // 보면 되므로 껍데기만 남기고 통과시킨다.
  HoverCard: ({ children }: any) => <>{children}</>,
  HoverCardTrigger: ({ children }: any) => <>{children}</>,
  HoverCardPortal: () => null,
  HoverCardContent: ({ children }: any) => <>{children}</>,
  CircleHelpIcon: () => <span data-testid="circle-help-icon" />,
}));

jest.mock('~/components/Chat/Menus', () => ({
  __esModule: true,
  OpenSidebar: () => <span />,
}));

jest.mock('~/components/Projects/AddToProjectPopover', () => ({
  __esModule: true,
  default: ({ children }: any) => <>{children}</>,
}));

jest.mock('~/utils', () => ({ __esModule: true, clearMessagesCache: jest.fn() }));

jest.mock('./SearchBar', () => ({
  __esModule: true,
  default: ({ onSubmit }: { onSubmit: (q: string) => void }) => (
    <button data-testid="stub-search" onClick={() => onSubmit('재검색')} />
  ),
}));

jest.mock('./ResultCard', () => ({
  __esModule: true,
  default: ({ hit }: { hit: DocumentHit }) => <div data-testid="hit">{hit.file_name}</div>,
}));

jest.mock('./FilterBar', () => ({
  __esModule: true,
  default: () => <div data-testid="stub-filter" />,
  EMPTY_DOC_FILTERS: { extensionGroups: [], library: 'all' },
  isFilterActive: () => false,
  resolvePeriodRange: () => ({ from: undefined, to: undefined }),
}));

import DocumentSearch from './DocumentSearch';

function hits(n: number): DocumentHit[] {
  return Array.from({ length: n }, (_, i) => ({
    doc_id: `doc-${i + 1}`,
    file_name: `문서 ${i + 1}`,
    score: 100 - i,
    chunk_count: 1,
    top_chunks: [],
  })) as unknown as DocumentHit[];
}

function setResults(count: number, extra: Partial<KeywordSearchResponse> = {}) {
  mockSearchState = {
    isLoading: false,
    isError: false,
    data: {
      query: '테스트',
      total: count,
      documents: hits(count),
      ...extra,
    } as KeywordSearchResponse,
  };
}

function renderPage() {
  return render(<DocumentSearch />);
}

function pageButton(n: number) {
  const nav = screen.getByRole('navigation');
  return within(nav).getByRole('button', { name: String(n) });
}

function shownNames() {
  return screen.getAllByTestId('hit').map((el) => el.textContent);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSearchState = { isLoading: false, isError: false };
  window.history.replaceState({}, '', '/?q=테스트');
});

describe('페이지네이션', () => {
  it('첫 페이지에 10건만 그린다', () => {
    setResults(25);
    renderPage();
    expect(shownNames()).toEqual(Array.from({ length: 10 }, (_, i) => `문서 ${i + 1}`));
  });

  it('총 페이지 수는 10건 단위로 올림한다', () => {
    setResults(25);
    renderPage();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: '3' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: '4' })).not.toBeInTheDocument();
  });

  it('마지막 페이지는 나머지만 그린다', () => {
    setResults(25);
    renderPage();
    fireEvent.click(pageButton(3));
    expect(shownNames()).toEqual(['문서 21', '문서 22', '문서 23', '문서 24', '문서 25']);
  });

  it('상한 100건이면 10페이지가 나온다', () => {
    setResults(100);
    renderPage();
    const nav = screen.getByRole('navigation');
    expect(within(nav).getByRole('button', { name: '10' })).toBeInTheDocument();
    expect(shownNames()).toHaveLength(10);
  });

  it('10건 이하면 페이지 네비게이션을 감춘다', () => {
    setResults(10);
    renderPage();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(shownNames()).toHaveLength(10);
  });

  it('이전/다음 버튼이 양 끝에서 비활성화된다', () => {
    setResults(25);
    renderPage();
    const nav = screen.getByRole('navigation');
    const prev = within(nav).getByRole('button', { name: 'com_document_search_page_prev' });
    const next = within(nav).getByRole('button', { name: 'com_document_search_page_next' });

    expect(prev).toBeDisabled();
    expect(next).toBeEnabled();

    fireEvent.click(pageButton(3));
    expect(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: 'com_document_search_page_prev',
      }),
    ).toBeEnabled();
    expect(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: 'com_document_search_page_next',
      }),
    ).toBeDisabled();
  });

  it('다음 버튼이 한 페이지씩 넘긴다', () => {
    setResults(25);
    renderPage();
    fireEvent.click(
      within(screen.getByRole('navigation')).getByRole('button', {
        name: 'com_document_search_page_next',
      }),
    );
    expect(shownNames()[0]).toBe('문서 11');
  });

  it('현재 페이지에 aria-current 를 준다', () => {
    setResults(25);
    renderPage();
    fireEvent.click(pageButton(2));
    expect(pageButton(2)).toHaveAttribute('aria-current', 'page');
    expect(pageButton(1)).not.toHaveAttribute('aria-current');
  });

  it('재검색하면 1페이지로 돌아간다', () => {
    setResults(25);
    renderPage();
    fireEvent.click(pageButton(3));
    expect(shownNames()[0]).toBe('문서 21');

    fireEvent.click(screen.getByTestId('stub-search'));
    expect(mockMutate).toHaveBeenCalled();
    expect(shownNames()[0]).toBe('문서 1');
  });

  it('top_k 100 으로 요청한다', () => {
    setResults(0);
    renderPage();
    fireEvent.click(screen.getByTestId('stub-search'));
    expect(mockMutate).toHaveBeenCalledWith(expect.objectContaining({ top_k: 100 }));
  });
});

describe('100건 초과 안내', () => {
  const NOTICE = 'com_document_search_limit_notice:100';
  const notice = () => screen.queryByRole('note', { name: NOTICE });

  it('truncated 면 띄운다', () => {
    setResults(100, { truncated: true, total_hit_count: 198 });
    renderPage();
    expect(notice()).toBeInTheDocument();
  });

  it('배너가 아니라 건수 옆 표식으로 붙는다', () => {
    setResults(100, { truncated: true, total_hit_count: 198 });
    renderPage();
    // 결과 문구와 같은 줄에 있어야 한다 (별도 블록으로 튀어나오면 안 됨).
    const heading = screen.getByText(/com_document_search_result_heading/);
    expect(heading).toContainElement(notice());
  });

  it('total_hit_count 만 상한을 넘으면 띄우지 않는다', () => {
    // 서버측 필터·ACL 이전 근사값이라 98건을 전부 보여준 경우에도 100 을
    // 넘길 수 있다. 이걸로 판정하면 다 보여주고도 "더 있다" 고 거짓말한다.
    setResults(98, { truncated: false, total_hit_count: 198 });
    renderPage();
    expect(notice()).not.toBeInTheDocument();
  });

  it('상한 이내면 띄우지 않는다', () => {
    setResults(30, { truncated: false, total_hit_count: 30 });
    renderPage();
    expect(notice()).not.toBeInTheDocument();
  });

  it('구버전 API 라 필드가 없으면 띄우지 않는다', () => {
    setResults(30);
    renderPage();
    expect(notice()).not.toBeInTheDocument();
  });

  it('결과가 0건이면 띄우지 않는다', () => {
    setResults(0, { truncated: true, total_hit_count: 198 });
    renderPage();
    expect(notice()).not.toBeInTheDocument();
  });
});

describe('전체 선택', () => {
  it('현재 페이지가 아니라 결과 전체 건수를 보여준다', () => {
    setResults(25);
    renderPage();
    expect(screen.getByRole('button', { name: '전체 선택 (25건)' })).toBeInTheDocument();
  });

  it('다른 페이지의 문서까지 선택된다', () => {
    setResults(25);
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: '전체 선택 (25건)' }));
    expect(screen.getByText('25건 선택')).toBeInTheDocument();
  });
});
