import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import type { PaletteEntry } from '~/hooks/Input/usePaletteEntries';
import type { AttachEntry } from '~/hooks/Input/useAttachItems';
import Palette from '../Palette';

/**
 * The palette's row model: what the list is made of, in what order, and what a
 * search does to it. The list is virtualized and the motion is measured in a
 * browser, so this covers the part that decides rows rather than draws them.
 */

/* AutoSizer measures its parent, which is zero in jsdom, and a zero width
   renders no rows at all. */
jest.mock('react-virtualized', () => {
  const actual = jest.requireActual('react-virtualized');
  return {
    ...actual,
    AutoSizer: ({ children }: { children: (size: { width: number }) => React.ReactNode }) =>
      children({ width: 640 }),
  };
});

jest.mock('~/hooks/Generic/useElementSize', () => ({
  __esModule: true,
  default: () => ({ ref: { current: null }, height: 0, width: 0 }),
}));

jest.mock('~/components/SharePoint', () => ({ SharePointPickerDialog: () => null }));

const mockToggleFavorite = jest.fn();
jest.mock('~/hooks/Input/useToolFavorites', () => ({
  __esModule: true,
  default: () => ({
    keys: new Set(mockFavoriteKeys),
    toggleFavorite: mockToggleFavorite,
    isFavorite: (key: string) => mockFavoriteKeys.includes(key),
  }),
}));

jest.mock('~/hooks/Input/useRecentFiles', () => ({
  __esModule: true,
  default: () => ({ files: mockRecentFiles, attach: jest.fn() }),
}));

jest.mock('~/hooks/Input/useAttachItems', () => ({
  __esModule: true,
  default: () => ({
    entries: mockAttachEntries,
    inputRef: { current: null },
    onFileChange: jest.fn(),
    isSharePointDialogOpen: false,
    setIsSharePointDialogOpen: jest.fn(),
    onSharePointFilesSelected: jest.fn(),
    isProcessing: false,
    downloadProgress: undefined,
    maxSelectionCount: 10,
  }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string, options?: Record<string, string | number>) =>
    options ? `${key}:${options['0'] ?? options.count}` : key,
}));

let mockFavoriteKeys: string[] = [];
let mockRecentFiles: Array<Record<string, unknown>> = [];
let mockAttachEntries: AttachEntry[] = [];

const attachEntry = (id: string, label: string, primary = false): AttachEntry => ({
  id,
  label,
  primary,
  icon: null,
  onSelect: jest.fn(),
});

const entry = (over: Partial<PaletteEntry> & Pick<PaletteEntry, 'key'>): PaletteEntry => ({
  itemType: 'tool',
  itemId: over.key,
  label: over.key,
  icon: null,
  section: 'tool',
  active: false,
  onSelect: jest.fn(),
  ...over,
});

const ENTRIES: PaletteEntry[] = [
  entry({ key: 'web_search', label: 'Web Search', section: 'tool' }),
  entry({ key: 'execute_code', label: 'Run Code', section: 'tool' }),
  entry({ key: 'skill:writer', label: 'writing-helper', section: 'skill', description: 'Drafts' }),
  entry({ key: 'mcp:github', label: 'Github', section: 'mcp' }),
];

const ATTACH: AttachEntry[] = [
  attachEntry('local:provider', 'Upload to Provider', true),
  attachEntry('local:context', 'Upload as Text'),
  attachEntry('local:file_search', 'Upload for File Search'),
  attachEntry('local:execute_code', 'Upload to Code Environment'),
];

function renderPalette(over: { canAttach?: boolean; entries?: PaletteEntry[] } = {}) {
  const anchorRef = { current: document.createElement('div') };
  const view = render(
    <RecoilRoot>
      <Palette
        index={0}
        conversationId="convo-1"
        conversation={{ conversationId: 'convo-1' } as TConversation}
        files={new Map()}
        setFiles={jest.fn()}
        setFilesLoading={jest.fn()}
        canAttach={over.canAttach ?? true}
        entries={over.entries ?? ENTRIES}
        anchorRef={anchorRef as React.RefObject<HTMLElement>}
      />
    </RecoilRoot>,
  );
  fireEvent.click(screen.getByTestId('composer-palette-button'));
  return view;
}

/** Row labels in list order, headers included, as the user reads them. The
 *  list's own containers are presentational too, so rows are found by the
 *  identity attribute rather than by role alone. */
const rows = () =>
  Array.from(document.querySelectorAll('#composer-palette-list [data-row-key]')).map(
    (row) => row.textContent?.trim() ?? '',
  );

/** Just the section headers, which is what carries the order. */
const headers = () =>
  Array.from(
    document.querySelectorAll<HTMLElement>('#composer-palette-list [data-row-key^="h:"]'),
  ).map((row) => row.textContent?.trim() ?? '');

/** Row identities in list order, which is what the model actually decides. */
const keys = () =>
  Array.from(document.querySelectorAll<HTMLElement>('#composer-palette-list [data-row-key]')).map(
    (row) => row.dataset.rowKey ?? '',
  );

const search = (text: string) => {
  const input = screen.getByTestId('composer-palette-search');
  fireEvent.change(input, { target: { value: text } });
};

describe('Palette', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFavoriteKeys = [];
    mockRecentFiles = [];
    mockAttachEntries = ATTACH;
  });

  describe('section order', () => {
    it('reads attach, tools, skills, servers, files', () => {
      mockRecentFiles = [{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }];
      renderPalette();
      expect(headers()).toEqual([
        'com_ui_composer_attach',
        'com_ui_composer_tools',
        'com_ui_skills',
        'com_ui_composer_mcp',
        'com_ui_composer_files',
      ]);
    });

    it('puts favourites above everything, out of their own sections', () => {
      mockFavoriteKeys = ['mcp:github'];
      renderPalette();
      const listed = rows();
      expect(listed[0]).toBe('com_ui_tools_view_favorites');
      expect(listed[1]).toBe('Github');
      /* And not left behind in the section it came from. */
      expect(listed.filter((row) => row === 'Github')).toHaveLength(1);
    });

    it('drops a section whose only member was starred', () => {
      mockFavoriteKeys = ['mcp:github'];
      renderPalette();
      expect(rows()).not.toContain('com_ui_composer_mcp');
    });

    it('offers no upload destinations when the endpoint cannot take them', () => {
      renderPalette({ canAttach: false });
      expect(rows()).not.toContain('com_ui_composer_attach');
      expect(rows()).not.toContain('Upload to Provider');
    });
  });

  describe('the folded upload destinations', () => {
    it('shows the ordinary destination and folds the rest away', () => {
      renderPalette();
      const listed = rows();
      expect(listed).toContain('Upload to Provider');
      expect(listed).toContain('com_ui_composer_attach_more');
      expect(listed).not.toContain('Upload to Code Environment');
    });

    it('reveals them in place, and folds them back', async () => {
      renderPalette();
      fireEvent.click(screen.getByText('com_ui_composer_attach_more'));
      expect(rows()).toContain('Upload to Code Environment');
      expect(rows()).toContain('com_ui_composer_attach_less');

      fireEvent.click(screen.getByText('com_ui_composer_attach_less'));
      /* Closing waits for the rows to fade before taking their space back, so
         the list still holds them for the length of that fade. */
      expect(rows()).toContain('Upload to Code Environment');
      await waitFor(() => expect(rows()).not.toContain('Upload to Code Environment'));
    });

    it('offers no disclosure when there is nothing to fold', () => {
      mockAttachEntries = [attachEntry('local:provider', 'Upload to Provider', true)];
      renderPalette();
      expect(rows()).toContain('Upload to Provider');
      expect(rows()).not.toContain('com_ui_composer_attach_more');
    });
  });

  describe('searching', () => {
    it('reaches a folded destination by name', () => {
      renderPalette();
      search('code environment');
      const listed = rows();
      expect(listed).toContain('Upload to Code Environment');
      /* The disclosure is there to keep the resting list short, not to make a
         row unfindable, so it steps out of the way of a search. */
      expect(listed).not.toContain('com_ui_composer_attach_more');
    });

    it('drops sections with nothing left in them', () => {
      renderPalette();
      search('github');
      expect(keys()).toEqual(['h:mcp', 'mcp:github']);
    });

    it('floats a label match above a description-only match', () => {
      renderPalette({
        canAttach: false,
        entries: [
          entry({ key: 'a', label: 'Notes', description: 'nothing to do with drafting' }),
          entry({ key: 'b', label: 'Drafting', description: 'unrelated' }),
        ],
      });
      search('draft');
      expect(keys()).toEqual(['h:tool', 'b', 'a']);
    });

    it('says so when nothing matches', () => {
      renderPalette();
      search('nothing matches this');
      expect(screen.getByText('com_ui_composer_no_results')).toBeInTheDocument();
    });
  });

  describe('keyboard', () => {
    it('starts on the first row that can be chosen, never on a header', () => {
      renderPalette();
      const input = screen.getByTestId('composer-palette-search');
      expect(input.getAttribute('aria-activedescendant')).toBe('palette-row-local:provider');
    });

    /* An id that names nothing is the failure mode here: screen readers lose
       the active option entirely and announce nothing in its place. */
    it('always points at a row that is in the document', () => {
      renderPalette();
      const input = screen.getByTestId('composer-palette-search');
      const pointsAtSomething = () => {
        const id = input.getAttribute('aria-activedescendant');
        return id != null && document.getElementById(id) != null;
      };
      expect(pointsAtSomething()).toBe(true);
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(pointsAtSomething()).toBe(true);
      search('code');
      expect(pointsAtSomething()).toBe(true);
    });

    it('keeps the highlight on a row that moved rather than on its old position', () => {
      mockFavoriteKeys = [];
      renderPalette({ canAttach: false });
      const input = screen.getByTestId('composer-palette-search');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      const moved = input.getAttribute('aria-activedescendant');
      expect(moved).toBe('palette-row-execute_code');

      /* Starring it lifts the row into favourites without changing the row
         count, which is exactly the case a positional highlight got wrong. */
      mockFavoriteKeys = ['execute_code'];
      fireEvent.keyDown(input, { key: 'd', metaKey: true });
      expect(input.getAttribute('aria-activedescendant')).toBe(moved);
    });

    it('leaves the list alone when the pointer moves over it', () => {
      renderPalette();
      const list = document.querySelector('.ReactVirtualized__Grid');
      expect(list?.getAttribute('tabindex')).toBe('-1');
      expect(list?.getAttribute('role')).toBe('presentation');
      expect(list?.getAttribute('aria-label')).toBe('');
    });

    it('steps over headers on the way down', () => {
      renderPalette();
      const input = screen.getByTestId('composer-palette-search');
      const active = () =>
        document.querySelector('[aria-selected="true"]')?.textContent?.trim() ?? '';

      expect(active()).toBe('Upload to Provider');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      expect(active()).toBe('com_ui_composer_attach_more');
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      /* The tools header sits between them and is skipped. */
      expect(active()).toBe('Web Search');
    });

    it('wraps from the last row back to the first', () => {
      renderPalette({ canAttach: false, entries: [entry({ key: 'only', label: 'Only Tool' })] });
      const input = screen.getByTestId('composer-palette-search');
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      expect(document.querySelector('[aria-selected="true"]')?.textContent?.trim()).toBe(
        'Only Tool',
      );
    });

    it('chooses the active row on Enter', () => {
      const onSelect = jest.fn();
      renderPalette({
        canAttach: false,
        entries: [entry({ key: 'only', label: 'Only Tool', onSelect })],
      });
      const input = screen.getByTestId('composer-palette-search');
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('stars the active row on Mod+D', () => {
      renderPalette({ canAttach: false, entries: [entry({ key: 'only', label: 'Only Tool' })] });
      const input = screen.getByTestId('composer-palette-search');
      fireEvent.keyDown(input, { key: 'd', metaKey: true });
      expect(mockToggleFavorite).toHaveBeenCalledTimes(1);
    });
  });
});
