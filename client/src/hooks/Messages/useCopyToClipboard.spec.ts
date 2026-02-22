import { renderHook, act } from '@testing-library/react';
import copy from 'copy-to-clipboard';
import { ContentTypes } from 'librechat-data-provider';
import type {
  SearchResultData,
  ProcessedOrganic,
  TMessageContentParts,
} from 'librechat-data-provider';
import useCopyToClipboard from '~/hooks/Messages/useCopyToClipboard';

// Mock the copy-to-clipboard module
jest.mock('copy-to-clipboard');

describe('useCopyToClipboard', () => {
  const mockSetIsCopied = jest.fn();
  const mockCopy = copy as jest.MockedFunction<typeof copy>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should copy plain text without citations', () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({
          text: 'Simple text without citations',
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockCopy).toHaveBeenCalledWith('Simple text without citations', {
        format: 'text/plain',
      });
      expect(mockSetIsCopied).toHaveBeenCalledWith(true);
    });

    it('should handle content array with text types', () => {
      const content = [
        { type: ContentTypes.TEXT, text: 'First line' },
        { type: ContentTypes.TEXT, text: 'Second line' },
      ];

      const { result } = renderHook(() =>
        useCopyToClipboard({
          content: content as TMessageContentParts[],
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockCopy).toHaveBeenCalledWith('First line\nSecond line', {
        format: 'text/plain',
      });
    });

    it('should reset isCopied after timeout', () => {
      const { result } = renderHook(() =>
        useCopyToClipboard({
          text: 'Test text',
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      expect(mockSetIsCopied).toHaveBeenCalledWith(true);

      act(() => {
        jest.advanceTimersByTime(3000);
      });

      expect(mockSetIsCopied).toHaveBeenCalledWith(false);
    });
  });

  describe('Citation formatting', () => {
    const mockSearchResults: { [key: string]: SearchResultData } = {
      '0': {
        organic: [
          {
            link: 'https://example.com/search1',
            title: 'Search Result 1',
            snippet: 'This is a search result',
          },
        ],
        topStories: [
          {
            link: 'https://example.com/news1',
            title: 'News Story 1',
          },
          {
            link: 'https://example.com/news2',
            title: 'News Story 2',
          },
        ],
        images: [
          {
            link: 'https://example.com/image1',
            title: 'Image 1',
          },
        ],
        videos: [
          {
            link: 'https://example.com/video1',
            title: 'Video 1',
          },
        ],
      },
    };

    it('should format standalone search citations', () => {
      const text = 'This is a fact \\ue202turn0search0 from search.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `This is a fact [1] from search.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should format news citations with correct mapping', () => {
      const text = 'Breaking news \\ue202turn0news0 and more news \\ue202turn0news1.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Breaking news [1] and more news [2].

Citations:
[1] https://example.com/news1
[2] https://example.com/news2
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle highlighted text with citations', () => {
      const text = '\\ue203This is highlighted text\\ue204 \\ue202turn0search0 with citation.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `**This is highlighted text** [1] with citation.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle composite citations', () => {
      const text =
        'Multiple sources \\ue200\\ue202turn0search0\\ue202turn0news0\\ue202turn0news1\\ue201.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Multiple sources [1][2][3].

Citations:
[1] https://example.com/search1
[2] https://example.com/news1
[3] https://example.com/news2
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Citation deduplication', () => {
    it('should use same number for duplicate URLs', () => {
      const mockSearchResultsWithDupes: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/article',
              title: 'Article from search',
            },
          ],
          topStories: [
            {
              link: 'https://example.com/article', // Same URL
              title: 'Article from news',
            },
          ],
        },
      };

      const text = 'First citation \\ue202turn0search0 and second \\ue202turn0news0.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResultsWithDupes,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `First citation [1] and second [1].

Citations:
[1] https://example.com/article
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle multiple citations of the same source', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/source1',
              title: 'Source 1',
            },
          ],
        },
      };

      const text =
        'First mention \\ue202turn0search0. Second mention \\ue202turn0search0. Third \\ue202turn0search0.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `First mention [1]. Second mention [1]. Third [1].

Citations:
[1] https://example.com/source1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Edge cases', () => {
    it('should handle missing search results gracefully', () => {
      const text = 'Text with citation \\ue202turn0search0 but no data.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: {},
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Updated expectation: Citation marker should be removed
      expect(mockCopy).toHaveBeenCalledWith('Text with citation but no data.', {
        format: 'text/plain',
      });
    });

    it('should handle invalid citation indices', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              link: 'https://example.com/search1',
              title: 'Search Result 1',
            },
          ],
        },
      };

      const text = 'Valid citation \\ue202turn0search0 and invalid \\ue202turn0search5.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Updated expectation: Invalid citation marker should be removed
      const expectedText = `Valid citation [1] and invalid.

Citations:
[1] https://example.com/search1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });

    it('should handle citations without links', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            {
              title: 'No link source',
              // No link property
            } as ProcessedOrganic,
          ],
        },
      };

      const text = 'Citation without link \\ue202turn0search0.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      // Updated expectation: Citation marker without link should be removed
      expect(mockCopy).toHaveBeenCalledWith('Citation without link.', {
        format: 'text/plain',
      });
    });

    it('should clean up orphaned citation lists at the end', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            { link: 'https://example.com/1', title: 'Source 1' },
            { link: 'https://example.com/2', title: 'Source 2' },
          ],
        },
      };

      const text = 'Text with citations \\ue202turn0search0.\n\n[1][2]';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Text with citations [1].

Citations:
[1] https://example.com/1
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('All citation types', () => {
    const mockSearchResults: { [key: string]: SearchResultData } = {
      '0': {
        organic: [{ link: 'https://example.com/search', title: 'Search' }],
        topStories: [{ link: 'https://example.com/news', title: 'News' }],
        images: [{ link: 'https://example.com/image', title: 'Image' }],
        videos: [{ link: 'https://example.com/video', title: 'Video' }],
        references: [{ link: 'https://example.com/ref', title: 'Reference', type: 'link' }],
      },
    };

    it('should handle all citation types correctly', () => {
      const text =
        'Search \\ue202turn0search0, news \\ue202turn0news0, image \\ue202turn0image0, video \\ue202turn0video0, ref \\ue202turn0ref0.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `Search [1], news [2], image [3], video [4], ref [5].

Citations:
[1] https://example.com/search
[2] https://example.com/news
[3] https://example.com/image
[4] https://example.com/video
[5] https://example.com/ref
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });

  describe('Complex scenarios', () => {
    it('should handle mixed highlighted text and composite citations', () => {
      const mockSearchResults: { [key: string]: SearchResultData } = {
        '0': {
          organic: [
            { link: 'https://example.com/1', title: 'Source 1' },
            { link: 'https://example.com/2', title: 'Source 2' },
          ],
          topStories: [{ link: 'https://example.com/3', title: 'News 1' }],
        },
      };

      const text =
        '\\ue203Highlighted text with citation\\ue204 \\ue202turn0search0 and composite \\ue200\\ue202turn0search1\\ue202turn0news0\\ue201.';

      const { result } = renderHook(() =>
        useCopyToClipboard({
          text,
          searchResults: mockSearchResults,
        }),
      );

      act(() => {
        result.current(mockSetIsCopied);
      });

      const expectedText = `**Highlighted text with citation** [1] and composite [2][3].

Citations:
[1] https://example.com/1
[2] https://example.com/2
[3] https://example.com/3
`;

      expect(mockCopy).toHaveBeenCalledWith(expectedText, { format: 'text/plain' });
    });
  });
});
