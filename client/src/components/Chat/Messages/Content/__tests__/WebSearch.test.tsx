import React from 'react';
import { RecoilRoot } from 'recoil';
import { Tools } from 'librechat-data-provider';
import { render, screen, fireEvent } from '@testing-library/react';
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
      com_ui_web_search_details: 'Search details',
      com_ui_search_query: 'Query',
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
  Info: () => <span data-testid="info-icon" />,
  Star: () => <span data-testid="star-icon" />,
  MapPin: () => <span data-testid="map-pin-icon" />,
  ChevronDown: ({ className }: { className?: string }) => (
    <span data-testid="chevron-icon" className={className} />
  ),
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
  args,
  output,
}: {
  searchResults?: Record<string, SearchResultData>;
  attachments?: TAttachment[];
  isSubmitting?: boolean;
  isLast?: boolean;
  initialProgress?: number;
  args?: string | Record<string, unknown>;
  output?: string | null;
}) {
  return render(
    <RecoilRoot>
      <SearchContext.Provider value={{ searchResults }}>
        <WebSearch
          initialProgress={initialProgress}
          isSubmitting={isSubmitting}
          isLast={isLast}
          args={args}
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

  describe('streaming favicons', () => {
    it('renders favicons for all ownTurn sources during streaming, before they are processed', () => {
      const searchResults = makeSearchResults({
        0: {
          organic: [
            { link: 'https://a.com', title: 'A', processed: true } as ValidSource,
            { link: 'https://b.com', title: 'B' } as ValidSource,
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

      const favicons = screen.getByTestId('stacked-favicons');
      // Both turn-0 sources show immediately — including the unprocessed one —
      // while the turn-1 source stays scoped out.
      expect(Number(favicons.getAttribute('data-count'))).toBe(2);
      expect(screen.getAllByText('Processing results').length).toBeGreaterThanOrEqual(1);
    });

    it('stays on "Searching the web" until any source for the turn arrives', () => {
      const searchResults = makeSearchResults({ 0: { organic: [] } });
      const attachments = [makeAttachment(0, searchResults['0'])];

      renderWebSearch({
        searchResults,
        attachments,
        isSubmitting: true,
        isLast: true,
        initialProgress: 0.5,
      });

      expect(screen.queryByTestId('stacked-favicons')).not.toBeInTheDocument();
      expect(screen.getAllByText('Searching the web').length).toBeGreaterThanOrEqual(1);
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

    it('renders snippets and dates in the source list', () => {
      const attachment = {
        type: Tools.web_search,
        [Tools.web_search]: {
          turn: 0,
          organic: [
            {
              link: 'https://example.com/context',
              title: 'Context windows explained',
              snippet: 'How context windows change what assistants can do.',
              date: 'Jun 12, 2026',
            },
          ],
        },
      } as unknown as TAttachment;

      renderWebSearch({ attachments: [attachment] });

      expect(
        screen.getByText('How context windows change what assistants can do.'),
      ).toBeInTheDocument();
      expect(screen.getByText('Jun 12, 2026')).toBeInTheDocument();
      expect(screen.getByText('example.com')).toBeInTheDocument();
    });

    it('tucks the query and answer box behind the details hover card', async () => {
      const attachment = {
        type: Tools.web_search,
        [Tools.web_search]: {
          turn: 0,
          organic: [{ link: 'https://example.com/context', title: 'Context windows explained' }],
          answerBox: {
            title: 'What is a context window?',
            snippet: 'The amount of text a model can consider at once.',
          },
        },
      } as unknown as TAttachment;

      renderWebSearch({
        attachments: [attachment],
        args: { query: 'largest context window LLM 2026' },
      });

      expect(screen.queryByText('What is a context window?')).not.toBeInTheDocument();

      const trigger = screen.getByLabelText('Search details');
      fireEvent.focus(trigger);

      expect(await screen.findByText('What is a context window?')).toBeInTheDocument();
      expect(
        screen.getByText('The amount of text a model can consider at once.'),
      ).toBeInTheDocument();
      expect(screen.getByText('largest context window LLM 2026')).toBeInTheDocument();
      expect(screen.getByText('1 source')).toBeInTheDocument();
    });

    it('renders shopping, image, and place verticals in the expanded panel', () => {
      const attachment = {
        type: Tools.web_search,
        [Tools.web_search]: {
          turn: 0,
          organic: [{ link: 'https://example.com/a', title: 'A source' }],
          images: [
            {
              title: 'Rain vortex',
              imageUrl: 'https://img.example.com/full.jpg',
              thumbnailUrl: 'https://img.example.com/thumb.jpg',
              thumbnailWidth: 300,
              thumbnailHeight: 200,
              link: 'https://host.example.com/page',
            },
          ],
          shopping: [
            {
              title: 'Gingko Mini Smart Book',
              link: 'https://shop.example.com/book',
              price: '35,70 \u20ac',
              source: 'Amazon',
              rating: 4.7,
              ratingCount: 1284,
              delivery: 'Free delivery',
            },
          ],
          places: [
            {
              name: 'Blue Bottle Coffee',
              category: 'Coffee shop',
              address: '300 S Broadway',
              rating: 4.6,
              ratingCount: 812,
            },
          ],
        },
      } as unknown as TAttachment;

      renderWebSearch({ attachments: [attachment] });

      const imageLink = screen.getByLabelText('Rain vortex');
      expect(imageLink).toHaveAttribute('href', 'https://host.example.com/page');
      expect(imageLink.querySelector('img')).toHaveAttribute(
        'src',
        'https://img.example.com/thumb.jpg',
      );

      const product = screen.getByText('Gingko Mini Smart Book').closest('a');
      expect(product).toHaveAttribute('href', 'https://shop.example.com/book');
      expect(screen.getByText('35,70 \u20ac \u00b7 Amazon')).toBeInTheDocument();
      expect(screen.getByText('Free delivery')).toBeInTheDocument();
      expect(screen.getByText('4.7')).toBeInTheDocument();

      expect(screen.getByText('Blue Bottle Coffee')).toBeInTheDocument();
      expect(screen.getByText('Coffee shop \u00b7 300 S Broadway')).toBeInTheDocument();
      expect(screen.getByText('4.6')).toBeInTheDocument();
      expect(screen.getByText('(812)')).toBeInTheDocument();
    });

    it('uses standard tool-row spacing and reveals its chevron on hover or focus', () => {
      const searchResults = makeSearchResults({
        0: { organic: [makeSource('https://example.com', 'Example')] },
      });

      renderWebSearch({ searchResults });

      const button = screen.getByRole('button', { name: /Searched the web/ });
      expect(button.parentElement).toHaveClass('h-5');
      expect(button.parentElement?.parentElement).toHaveClass('my-1');
      expect(button).not.toHaveClass('py-1');
      expect(button).not.toHaveClass('transition-colors');
      const chevron = screen.getByTestId('chevron-icon');
      expect(chevron).toHaveClass(
        'opacity-0',
        'group-hover/disclosure:opacity-100',
        'group-focus-within/disclosure:opacity-100',
      );
      expect(chevron).toHaveClass('transition-transform');
      expect(chevron.className).not.toContain('transition-opacity');
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
