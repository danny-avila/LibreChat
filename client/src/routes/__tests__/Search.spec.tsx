import React from 'react';
import { useRecoilValue } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import { useMessagesInfiniteQuery } from '~/data-provider';
import Search from '../Search';

/* react-virtualized measures nothing in jsdom; render every row flatly so the
   list contents are exercised. */
const mockListHandle = {
  scrollToPosition: jest.fn(),
  scrollToRow: jest.fn(),
  recomputeRowHeights: jest.fn(),
};

jest.mock('react-virtualized', () => {
  const mockReact = jest.requireActual<typeof React>('react');
  return {
    __esModule: true,
    CellMeasurerCache: class {
      getHeight() {
        return 100;
      }

      clearAll() {}
    },
    CellMeasurer: ({
      children,
    }: {
      children: (a: { registerChild: () => void }) => React.ReactNode;
    }) => children({ registerChild: () => {} }),
    List: mockReact.forwardRef(
      (
        {
          rowCount,
          rowRenderer,
          onRowsRendered,
        }: {
          rowCount: number;
          rowRenderer: (p: {
            index: number;
            key: string;
            parent: unknown;
            style: object;
          }) => React.ReactNode;
          onRowsRendered?: (p: { startIndex: number; stopIndex: number }) => void;
        },
        ref: React.ForwardedRef<unknown>,
      ) => {
        // expose the near-bottom trigger for the pagination test
        (globalThis as Record<string, unknown>).__triggerRowsRendered = () =>
          onRowsRendered?.({ startIndex: 0, stopIndex: rowCount - 1 });
        /** The route drives the list imperatively through a ref; a rail jump is
         *  invisible without one. */
        mockReact.useImperativeHandle(ref, () => mockListHandle, []);
        return (
          <div data-testid="virtual-list">
            {Array.from({ length: rowCount }, (_, i) =>
              rowRenderer({ index: i, key: String(i), parent: {}, style: {} }),
            )}
          </div>
        );
      },
    ),
  };
});

jest.mock('recoil', () => ({ useRecoilValue: jest.fn() }));
jest.mock('~/data-provider', () => ({ useMessagesInfiniteQuery: jest.fn() }));
jest.mock('~/Providers', () => ({ useFileMapContext: () => ({}) }));
jest.mock('@librechat/client', () => ({
  Spinner: () => <div data-testid="spinner" />,
  useToastContext: () => ({ showToast: jest.fn() }),
}));
jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ isAuthenticated: true }),
  useElementSize: () => ({ ref: () => {}, width: 800, height: 600 }),
}));
jest.mock('~/store', () => ({ __esModule: true, default: { search: 'search-atom' } }));
jest.mock('~/components/Chat/Messages/SearchMessage', () => ({
  __esModule: true,
  default: ({ message }: { message: { text: string } }) => (
    <div className="search-row">{message.text}</div>
  ),
}));
jest.mock('~/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));
jest.mock('jotai', () => ({ useAtomValue: () => 'text-base' }));
jest.mock('~/store/fontSize', () => ({ fontSizeAtom: {} }));

type NavEntry = { id: string; index: number; isUser: boolean; isEnd: boolean; preview: string };
type NavProps = {
  entries: NavEntry[];
  currentIndex: number | null;
  visibleIndices: Set<number>;
  onJump: (index: number, smooth: boolean) => void;
};
let mockNavProps: NavProps | null = null;
jest.mock('~/components/Chat/Messages/SearchNav', () => ({
  __esModule: true,
  default: (props: NavProps) => {
    mockNavProps = props;
    return <div data-testid="search-nav" data-count={props.entries.length} />;
  },
}));
jest.mock('~/components/Chat/Messages/MessageNav', () => ({
  __esModule: true,
  extractPreviewFromContent: () => '',
}));

const mockUseRecoilValue = useRecoilValue as jest.Mock;
const mockUseQuery = useMessagesInfiniteQuery as jest.Mock;

const searchState = (over: Record<string, unknown> = {}) => ({
  enabled: true,
  query: 'zephyrine',
  debouncedQuery: 'zephyrine',
  isSearching: false,
  isTyping: false,
  ...over,
});

const queryResult = (over: Record<string, unknown> = {}) => ({
  data: { pages: [{ messages: [{ messageId: 'm1', text: 'row one' }], nextCursor: null }] },
  isLoading: false,
  isError: false,
  fetchNextPage: jest.fn(),
  isFetchingNextPage: false,
  hasNextPage: false,
  isPreviousData: false,
  ...over,
});

describe('Search route', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockNavProps = null;
  });

  it('renders result rows when data is present', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(queryResult());
    render(<Search />);
    expect(screen.getByText('row one')).toBeInTheDocument();
    expect(screen.queryByTestId('spinner')).not.toBeInTheDocument();
  });

  it('keeps results mounted while typing (does NOT flash the full spinner)', () => {
    mockUseRecoilValue.mockReturnValue(searchState({ isTyping: true }));
    mockUseQuery.mockReturnValue(queryResult());
    render(<Search />);
    // The whole list must stay — this is the core regression fix.
    expect(screen.getByText('row one')).toBeInTheDocument();
  });

  it('shows the full spinner only on initial load with no results', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(queryResult({ isLoading: true, data: undefined }));
    render(<Search />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('row one')).not.toBeInTheDocument();
  });

  it('shows nothing-found when the query returned no results', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({ data: { pages: [{ messages: [], nextCursor: null }] } }),
    );
    render(<Search />);
    expect(screen.getAllByText('com_ui_nothing_found').length).toBeGreaterThan(0);
  });

  it('shows the spinner (not a false nothing-found) when stale empty data is held during a refetch', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({
        data: { pages: [{ messages: [], nextCursor: null }] },
        isPreviousData: true,
      }),
    );
    render(<Search />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
    expect(screen.queryByText('com_ui_nothing_found')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no query and the user is idle', () => {
    mockUseRecoilValue.mockReturnValue(searchState({ debouncedQuery: '' }));
    mockUseQuery.mockReturnValue(queryResult({ data: undefined }));
    const { container } = render(<Search />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the spinner during the initial debounce (query typed, not yet debounced)', () => {
    mockUseRecoilValue.mockReturnValue(
      searchState({ query: 'zephyrine', debouncedQuery: '', isTyping: true }),
    );
    mockUseQuery.mockReturnValue(queryResult({ data: undefined }));
    render(<Search />);
    expect(screen.getByTestId('spinner')).toBeInTheDocument();
  });

  it('announces empty results through a live region', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({ data: { pages: [{ messages: [], nextCursor: null }] } }),
    );
    render(<Search />);
    expect(screen.getByRole('alert')).toHaveTextContent('com_ui_nothing_found');
  });

  it('fetches the next page when scrolled near the bottom', () => {
    const fetchNextPage = jest.fn();
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(queryResult({ hasNextPage: true, fetchNextPage }));
    render(<Search />);
    act(() => {
      (globalThis as unknown as Record<string, () => void>).__triggerRowsRendered();
    });
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('does NOT paginate the outgoing query while the user is still typing', () => {
    const fetchNextPage = jest.fn();
    mockUseRecoilValue.mockReturnValue(searchState({ isTyping: true }));
    mockUseQuery.mockReturnValue(queryResult({ hasNextPage: true, fetchNextPage }));
    render(<Search />);
    (globalThis as unknown as Record<string, () => void>).__triggerRowsRendered();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('does NOT paginate while previous-query results are still mounted (refetch in flight)', () => {
    const fetchNextPage = jest.fn();
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({ hasNextPage: true, isPreviousData: true, fetchNextPage }),
    );
    render(<Search />);
    (globalThis as unknown as Record<string, () => void>).__triggerRowsRendered();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it('renders a trailing spacer row so the last result clears the bottom overlay', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(queryResult());
    render(<Search />);
    expect(screen.getByText('row one')).toBeInTheDocument();
    expect(screen.getByTestId('search-footer')).toBeInTheDocument();
  });

  it('abandons a rail jump still animating when the query changes underneath it', () => {
    // The jump eases over 400ms and finishes by snapping to a row index. Left
    // running across a new query it keeps writing positions over the reseed and
    // lands on an index from the previous result set, so the fresh results open
    // partway down the list.
    const frames: FrameRequestCallback[] = [];
    const rafSpy = jest
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((cb: FrameRequestCallback) => {
        frames.push(cb);
        return frames.length;
      });
    const rows = Array.from({ length: 20 }, (_, i) => ({
      messageId: `m${i}`,
      text: `row ${i}`,
    }));
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({ data: { pages: [{ messages: rows, nextCursor: null }] } }),
    );
    const { rerender } = render(<Search />);

    /** The reader jumps to a late result. */
    act(() => {
      mockNavProps?.onJump(15, true);
    });
    const pending = frames.splice(0);
    expect(pending.length).toBeGreaterThan(0);

    /** A new query arrives mid-flight. */
    mockUseRecoilValue.mockReturnValue(searchState({ query: 'other', debouncedQuery: 'other' }));
    act(() => {
      rerender(<Search />);
    });
    mockListHandle.scrollToPosition.mockClear();
    mockListHandle.scrollToRow.mockClear();

    /** Every frame the old jump had queued now runs. */
    act(() => {
      for (const frame of frames.splice(0).concat(pending)) {
        frame(1_000_000);
      }
    });

    expect(mockListHandle.scrollToRow).not.toHaveBeenCalledWith(15);
    /** The reseed's own scroll to the top is the only position write allowed;
     *  an intermediate easing value means the abandoned jump is still driving. */
    for (const [position] of mockListHandle.scrollToPosition.mock.calls) {
      expect(position).toBe(0);
    }
    rafSpy.mockRestore();
  });

  it('passes an entry per result (plus a trailing end marker) to the nav rail', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          pages: [
            {
              messages: [
                { messageId: 'a', text: 'one', isCreatedByUser: true },
                { messageId: 'b', text: 'two', isCreatedByUser: false },
                { messageId: 'c', text: 'three', isCreatedByUser: true },
              ],
              nextCursor: null,
            },
          ],
        },
      }),
    );
    render(<Search />);
    expect(mockNavProps).not.toBeNull();
    expect(mockNavProps?.entries).toHaveLength(4);
    expect(mockNavProps?.entries[0]).toMatchObject({ id: 'a', index: 0, isUser: true });
    expect(mockNavProps?.entries[3]).toMatchObject({ isEnd: true });
  });

  it('updates the visible range when the list reports rendered rows', () => {
    mockUseRecoilValue.mockReturnValue(searchState());
    mockUseQuery.mockReturnValue(
      queryResult({
        data: {
          pages: [
            {
              messages: [
                { messageId: 'a', text: 'one' },
                { messageId: 'b', text: 'two' },
                { messageId: 'c', text: 'three' },
              ],
              nextCursor: null,
            },
          ],
        },
      }),
    );
    render(<Search />);
    act(() => {
      (globalThis as unknown as Record<string, () => void>).__triggerRowsRendered();
    });
    expect(mockNavProps?.currentIndex).toBe(0);
    expect(mockNavProps?.visibleIndices.has(0)).toBe(true);
    expect(mockNavProps?.visibleIndices.has(2)).toBe(true);
  });
});
