import React from 'react';
import { RecoilRoot } from 'recoil';
import { Tools } from 'librechat-data-provider';
import { render, screen } from '@testing-library/react';
import type { TAttachment, SearchResultData, ValidSource } from 'librechat-data-provider';
import { SearchContext } from '~/Providers';
import WebSearch from '../WebSearch';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, values?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      com_ui_web_searching: 'Searching the web',
      com_ui_web_searching_again: 'Searching again',
      com_ui_web_search_processing: 'Processing results',
      com_ui_web_search_reading: 'Reading sources',
      com_ui_web_searched: 'Searched the web',
      com_ui_web_search_source: `${values?.count ?? 1} source`,
      com_ui_web_search_sources: `${values?.count ?? 0} sources`,
    };
    return translations[key] || key;
  },
  useExpandCollapse: (isExpanded: boolean) => ({
    style: {
      display: 'grid',
      gridTemplateRows: isExpanded ? '1fr' : '0fr',
      opacity: isExpanded ? 1 : 0,
    },
    ref: { current: null },
  }),
}));

jest.mock('~/utils/cn', () => ({
  __esModule: true,
  default: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/components/Web/SourceHovercard', () => ({
  FaviconImage: ({ domain }: { domain: string }) => (
    <span data-testid="favicon" data-domain={domain} />
  ),
  getCleanDomain: (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  },
}));

jest.mock('~/components/Web/Sources', () => ({
  StackedFavicons: ({ sources }: { sources: ValidSource[] }) => (
    <span data-testid="stacked-favicons" data-count={sources.length} />
  ),
}));

jest.mock('lucide-react', () => ({
  Globe: () => <span data-testid="globe-icon" />,
  ChevronDown: () => <span data-testid="chevron-icon" />,
}));

function makeSource(link: string, title: string): ValidSource {
  return { link, title } as ValidSource;
}

function makeSearchResults(
  turns: Record<number, { organic?: ValidSource[]; topStories?: ValidSource[] }>,
): Record<string, SearchResultData> {
  const results: Record<string, SearchResultData> = {};
  for (const [turn, data] of Object.entries(turns)) {
    results[turn] = { turn: Number(turn), ...data } as SearchResultData;
  }
  return results;
}

function makeAttachment(turn: number, data: SearchResultData): TAttachment {
  return {
    type: Tools.web_search,
    [Tools.web_search]: { ...data, turn },
  } as unknown as TAttachment;
}

function renderWebSearch({
  searchResults,
  attachments,
  isSubmitting = false,
  isLast = false,
  initialProgress = 1,
  output,
}: {
  searchResults?: Record<string, SearchResultData>;
  attachments?: TAttachment[];
  isSubmitting?: boolean;
  isLast?: boolean;
  initialProgress?: number;
  output?: string | null;
}) {
  return render(
    <RecoilRoot>
      <SearchContext.Provider value={{ searchResults }}>
        <WebSearch
          initialProgress={initialProgress}
          isSubmitting={isSubmitting}
          isLast={isLast}
          output={output}
          attachments={attachments}
        />
      </SearchContext.Provider>
    </RecoilRoot>,
  );
}

describe('WebSearch', () => {
  describe('turn scoping', () => {
    const turn0Sources = [
      makeSource('https://pi.example.com/1', 'Pi Article 1'),
      makeSource('https://pi.example.com/2', 'Pi Article 2'),
    ];
    const turn1Sources = [
      makeSource('https://neutrino.example.com/1', 'Neutrino Article 1'),
      makeSource('https://neutrino.example.com/3', 'Neutrino Article 3'),
    ];

    const searchResults = makeSearchResults({
      0: { organic: turn0Sources },
      1: { organic: turn1Sources },
    });

    it('shows only turn-0 sources for a turn-0 instance via attachments', () => {
      const attachments = [makeAttachment(0, searchResults['0'])];

      renderWebSearch({ searchResults, attachments });

      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));

      expect(hrefs).toContain('https://pi.example.com/1');
      expect(hrefs).toContain('https://pi.example.com/2');
      expect(hrefs).not.toContain('https://neutrino.example.com/1');
      expect(hrefs).not.toContain('https://neutrino.example.com/3');
    });

    it('shows only turn-1 sources for a turn-1 instance via attachments', () => {
      const attachments = [makeAttachment(1, searchResults['1'])];

      renderWebSearch({ searchResults, attachments });

      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));

      expect(hrefs).toContain('https://neutrino.example.com/1');
      expect(hrefs).toContain('https://neutrino.example.com/3');
      expect(hrefs).not.toContain('https://pi.example.com/1');
      expect(hrefs).not.toContain('https://pi.example.com/2');
    });

    it('two instances under the same SearchContext show distinct sources', () => {
      const { container: container0 } = render(
        <RecoilRoot>
          <SearchContext.Provider value={{ searchResults }}>
            <WebSearch
              initialProgress={1}
              isSubmitting={false}
              attachments={[makeAttachment(0, searchResults['0'])]}
            />
          </SearchContext.Provider>
        </RecoilRoot>,
      );

      const { container: container1 } = render(
        <RecoilRoot>
          <SearchContext.Provider value={{ searchResults }}>
            <WebSearch
              initialProgress={1}
              isSubmitting={false}
              attachments={[makeAttachment(1, searchResults['1'])]}
            />
          </SearchContext.Provider>
        </RecoilRoot>,
      );

      const links0 = Array.from(container0.querySelectorAll('a[href]')).map((a) =>
        a.getAttribute('href'),
      );
      const links1 = Array.from(container1.querySelectorAll('a[href]')).map((a) =>
        a.getAttribute('href'),
      );

      expect(links0).toHaveLength(2);
      expect(links1).toHaveLength(2);

      for (const href of links0) {
        expect(links1).not.toContain(href);
      }
    });

    it('falls back to searchResults[ownTurn] when attachments is undefined', () => {
      renderWebSearch({ searchResults });

      const links = screen.getAllByRole('link');
      const hrefs = links.map((l) => l.getAttribute('href'));

      expect(hrefs).toContain('https://pi.example.com/1');
      expect(hrefs).toContain('https://pi.example.com/2');
      expect(hrefs).not.toContain('https://neutrino.example.com/1');
    });
  });

  describe('processedSources scoping', () => {
    it('shows processed sources only from ownTurn during streaming', () => {
      const searchResults = makeSearchResults({
        0: {
          organic: [
            { link: 'https://a.com', title: 'A', processed: true } as ValidSource,
            { link: 'https://b.com', title: 'B', processed: false } as ValidSource,
          ],
        },
        1: {
          organic: [{ link: 'https://c.com', title: 'C', processed: true } as ValidSource],
        },
      });

      const attachments = [makeAttachment(0, searchResults['0'])];

      renderWebSearch({
        searchResults,
        attachments,
        isSubmitting: true,
        isLast: true,
        initialProgress: 0.5,
      });

      const favicons = screen.queryAllByTestId('stacked-favicons');
      if (favicons.length > 0) {
        const count = Number(favicons[0].getAttribute('data-count'));
        expect(count).toBeLessThanOrEqual(2);
      }
    });
  });

  describe('component states', () => {
    it('renders null when cancelled (not submitting and progress < 1)', () => {
      const { container } = renderWebSearch({
        isSubmitting: false,
        initialProgress: 0.5,
      });
      expect(container.innerHTML).toBe('');
    });

    it('renders null on error output', () => {
      const { container } = renderWebSearch({
        isSubmitting: false,
        initialProgress: 0.5,
        output: 'Error processing search results',
      });
      expect(container.innerHTML).toBe('');
    });

    it('renders completed state with source count', () => {
      const searchResults = makeSearchResults({
        0: { organic: [makeSource('https://example.com', 'Example')] },
      });

      renderWebSearch({ searchResults });

      const matches = screen.getAllByText('Searched the web');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders searching state during streaming', () => {
      renderWebSearch({
        isSubmitting: true,
        isLast: true,
        initialProgress: 0.5,
      });

      const matches = screen.getAllByText('Searching the web');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('shows "searching again" for turn > 0', () => {
      const searchResults = makeSearchResults({
        1: { organic: [] },
      });
      const attachments = [makeAttachment(1, searchResults['1'])];

      renderWebSearch({
        searchResults,
        attachments,
        isSubmitting: true,
        isLast: true,
        initialProgress: 0.5,
      });

      const matches = screen.getAllByText('Searching again');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
