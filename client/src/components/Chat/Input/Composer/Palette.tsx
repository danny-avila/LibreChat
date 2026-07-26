import React, {
  memo,
  useRef,
  useMemo,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
} from 'react';
import * as Ariakit from '@ariakit/react';
import { useSetRecoilState } from 'recoil';
import { Star, Plus, Search } from 'lucide-react';
import { AutoSizer, List } from 'react-virtualized';
import { FileUpload, TooltipAnchor } from '@librechat/client';
import type {
  TFile,
  TConversation,
  EModelEndpoint,
  EndpointFileConfig,
} from 'librechat-data-provider';
import type { PaletteEntry, PaletteSection } from '~/hooks/Input/usePaletteEntries';
import type { AttachEntry } from '~/hooks/Input/useAttachItems';
import type { ExtendedFile, FileSetter } from '~/common';
import type { TranslationKeys } from '~/hooks';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { SharePointPickerDialog } from '~/components/SharePoint';
import useToolFavorites from '~/hooks/Input/useToolFavorites';
import useElementSize from '~/hooks/Generic/useElementSize';
import useRecentFiles from '~/hooks/Input/useRecentFiles';
import useAttachItems from '~/hooks/Input/useAttachItems';
import { getFileType } from '~/utils';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

const HEADER_HEIGHT = 26;
const ROW_HEIGHT = 34;
const ROW_HEIGHT_DESC = 46;
/* Kept short enough that the popup clears the space below the composer, so it
   opens downward instead of Ariakit flipping it up over the thread. */
const LIST_MAX_HEIGHT = 300;
/* Unsearched, the section is a shortcut to what was just uploaded rather than a
   file manager; typing searches the whole list. */
const RECENT_FILE_COUNT = 5;
/** Gap between the composer and the popup, and between the popup and the
 *  bottom of the window. Shared with the `gutter` prop so the room the page
 *  makes and the room the popup takes cannot drift apart. */
const POPOVER_GUTTER = 8;
const VIEWPORT_PADDING = 12;
/** Length of the landing screen's lift transition; see `ChatView`'s
 *  `duration-200` on the same element. */
const LIFT_MS = 200;

const SECTION_LABEL: Record<PaletteSection, TranslationKeys> = {
  tool: 'com_ui_composer_tools',
  skill: 'com_ui_skills',
  mcp: 'com_ui_composer_mcp',
};

type PaletteRow =
  | { type: 'header'; key: string; label: string }
  | { type: 'attach'; key: string; entry: AttachEntry }
  | { type: 'file'; key: string; file: TFile }
  | { type: 'entry'; key: string; entry: PaletteEntry; isFavorite: boolean };

const isSelectable = (row: PaletteRow) => row.type !== 'header';

/** Ranks a match so exact prefixes float above incidental description hits. */
function scoreEntry(label: string, description: string | undefined, query: string): number {
  const lower = label.toLowerCase();
  if (lower.startsWith(query)) {
    return 0;
  }
  if (lower.includes(query)) {
    return 1;
  }
  if (description?.toLowerCase().includes(query) === true) {
    return 2;
  }
  return -1;
}

/** The file's own date, in the user's locale, as the row's second line. */
function formatFileDate(file: TFile): string {
  const raw = file.updatedAt ?? file.createdAt;
  if (raw == null) {
    return '';
  }
  return new Date(raw).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function rowHeight(row: PaletteRow): number {
  if (row.type === 'header') {
    return HEADER_HEIGHT;
  }
  if (row.type === 'entry' && row.entry.description != null && row.entry.description !== '') {
    return ROW_HEIGHT_DESC;
  }
  if (row.type === 'file') {
    return ROW_HEIGHT_DESC;
  }
  return ROW_HEIGHT;
}

interface PaletteProps {
  /** Composer index, so a split view lifts only the side that opened a popup. */
  index: number;
  disabled?: boolean;
  agentId?: string | null;
  endpoint?: string | null;
  endpointType?: EModelEndpoint | string;
  endpointFileConfig?: EndpointFileConfig;
  useResponsesApi?: boolean;
  conversationId: string;
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  /** Attach destinations are hidden when the endpoint cannot take uploads. */
  canAttach: boolean;
  /** Owned by `Bar`, which also renders the active ones as chips — derived once
   *  there so the skills catalog is not walked twice per render. */
  entries: PaletteEntry[];
  /** The composer box the popover anchors to, so it matches its width. */
  anchorRef: React.RefObject<HTMLElement>;
}

/**
 * The composer's single entry point for everything that is not typing: upload
 * destinations, built-in tools, skills and MCP servers, all searchable from one
 * input and all favouritable.
 *
 * Replaces the old split between the attach `+` menu and the tools gear, and
 * the pin/drag/wiggle badge row — a starred row floats into Favourites, which
 * is server-persisted and shared with the tools marketplace.
 *
 * The list is virtualized (catalogs run to hundreds of skills and MCP servers),
 * so keyboard navigation is driven manually against the flat row model rather
 * than by an Ariakit composite, mirroring `SkillsCommand`. Favouriting is a
 * pointer action on the star and `Mod+D` on the active row, keeping each row a
 * single valid `option` rather than nesting a button inside it.
 */
function Palette({
  index,
  disabled,
  agentId,
  endpoint,
  endpointType,
  endpointFileConfig,
  useResponsesApi,
  conversationId,
  conversation,
  files,
  setFiles,
  setFilesLoading,
  canAttach,
  entries,
  anchorRef,
}: PaletteProps) {
  const localize = useLocalize();
  /* Ariakit owns the open state rather than a controlled `open`/`setOpen` pair:
     with the controlled form, hide-on-interact-outside fired on mousedown and
     the disclosure's own click re-opened it, so clicking `+` while the palette
     was up reopened it instead of closing it. */
  const popover = Ariakit.usePopoverStore({ placement: 'bottom-start' });
  const open = popover.useState('open');
  const mounted = popover.useState('mounted');
  const [search, setSearch] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const setLift = useSetRecoilState(store.composerLiftFamily(index));
  const { ref: popoverRef, height: popupHeight } = useElementSize<HTMLDivElement>();

  /* Rather than let the popup push the document taller — which puts a scrollbar
     on a page that had none — the landing screen raises itself by whatever the
     popup cannot fit, and follows the popup as searching grows and shrinks it.

     The room needed is measured against where the composer sits *unlifted*,
     captured on opening while the lift is still zero. Measuring it live would
     read a composer that has already moved out of the way — the overflow would
     look solved, the page would drop back, and the two would fight. */
  /* The composer moves under a transform, which is not a layout change and so
     nothing tells the popup its anchor has shifted. Repositioning it for the
     length of the lift keeps the two glued together for the whole ride. */
  const followRef = useRef<number | null>(null);
  const follow = useCallback(() => {
    if (followRef.current != null) {
      cancelAnimationFrame(followRef.current);
    }
    const start = performance.now();
    const step = () => {
      popover.render();
      followRef.current = performance.now() - start < LIFT_MS ? requestAnimationFrame(step) : null;
    };
    followRef.current = requestAnimationFrame(step);
  }, [popover]);

  useEffect(
    () => () => {
      if (followRef.current != null) {
        cancelAnimationFrame(followRef.current);
      }
    },
    [],
  );

  const baselineRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    if (!mounted) {
      baselineRef.current = null;
      setLift(0);
      return;
    }
    if (baselineRef.current == null) {
      const anchor = anchorRef.current;
      if (!anchor) {
        return;
      }
      baselineRef.current = anchor.getBoundingClientRect().bottom;
    }
    if (popupHeight === 0) {
      return;
    }
    const needed = popupHeight + POPOVER_GUTTER + VIEWPORT_PADDING;
    setLift(Math.max(0, Math.ceil(needed - (window.innerHeight - baselineRef.current))));
    follow();
  }, [mounted, popupHeight, setLift, anchorRef, follow]);

  const favorites = useToolFavorites();
  const recent = useRecentFiles(mounted && canAttach);
  const attach = useAttachItems({
    agentId,
    endpoint,
    endpointType,
    endpointFileConfig,
    useResponsesApi,
    conversationId,
    conversation,
    files,
    setFiles,
    setFilesLoading,
  });

  const query = search.trim().toLowerCase();

  /** One pass over each source: filter by query, split favourites out, then
   *  flatten to the row model the virtualized list renders from. */
  const rows = useMemo<PaletteRow[]>(() => {
    const favoriteMatches: PaletteEntry[] = [];
    const buckets: Record<PaletteSection, PaletteEntry[]> = { tool: [], skill: [], mcp: [] };

    for (const entry of entries) {
      if (query !== '' && scoreEntry(entry.label, entry.description, query) < 0) {
        continue;
      }
      if (favorites.keys.has(entry.key)) {
        favoriteMatches.push(entry);
        continue;
      }
      buckets[entry.section].push(entry);
    }

    if (query !== '') {
      const rank = (entry: PaletteEntry) => scoreEntry(entry.label, entry.description, query);
      const byRank = (a: PaletteEntry, b: PaletteEntry) => rank(a) - rank(b);
      favoriteMatches.sort(byRank);
      buckets.tool.sort(byRank);
      buckets.skill.sort(byRank);
      buckets.mcp.sort(byRank);
    }

    const next: PaletteRow[] = [];

    if (favoriteMatches.length > 0) {
      next.push({
        type: 'header',
        key: 'h:favorites',
        label: localize('com_ui_tools_view_favorites'),
      });
      for (const entry of favoriteMatches) {
        next.push({ type: 'entry', key: entry.key, entry, isFavorite: true });
      }
    }

    if (canAttach) {
      const matched =
        query === ''
          ? attach.entries
          : attach.entries.filter((item) => item.label.toLowerCase().includes(query));
      if (matched.length > 0) {
        next.push({ type: 'header', key: 'h:attach', label: localize('com_ui_composer_attach') });
        for (const entry of matched) {
          next.push({ type: 'attach', key: entry.id, entry });
        }
      }
    }

    const pushSection = (section: PaletteSection) => {
      const list = buckets[section];
      if (list.length === 0) {
        return;
      }
      next.push({
        type: 'header',
        key: `h:${section}`,
        label: localize(SECTION_LABEL[section]),
      });
      for (const entry of list) {
        next.push({ type: 'entry', key: entry.key, entry, isFavorite: false });
      }
    };

    pushSection('skill');
    pushSection('tool');
    pushSection('mcp');

    if (canAttach) {
      const matchedFiles =
        query === ''
          ? recent.files.slice(0, RECENT_FILE_COUNT)
          : recent.files.filter((file) => file.filename?.toLowerCase().includes(query));
      if (matchedFiles.length > 0) {
        next.push({ type: 'header', key: 'h:files', label: localize('com_ui_composer_files') });
        for (const file of matchedFiles) {
          next.push({ type: 'file', key: `file:${file.file_id}`, file });
        }
      }
    }

    return next;
  }, [entries, favorites.keys, query, attach.entries, recent.files, canAttach, localize]);

  const totalHeight = useMemo(() => {
    let height = 0;
    for (const row of rows) {
      height += rowHeight(row);
    }
    return height;
  }, [rows]);

  const firstSelectable = useMemo(() => rows.findIndex(isSelectable), [rows]);

  /** Keep the highlight on a real row as the query narrows the list. */
  const [lastRowsKey, setLastRowsKey] = useState('');
  const rowsKey = `${rows.length}:${rows[0]?.key ?? ''}`;
  if (rowsKey !== lastRowsKey) {
    setLastRowsKey(rowsKey);
    setActiveIndex(firstSelectable === -1 ? 0 : firstSelectable);
  }

  /* Cleared on unmount rather than on close: the popup stays up through its
     leave animation, so clearing on close emptied the field and repopulated the
     list in full view of the user. */
  const [wasMounted, setWasMounted] = useState(false);
  if (mounted !== wasMounted) {
    setWasMounted(mounted);
    if (!mounted) {
      setSearch('');
    }
  }

  const step = useCallback(
    (direction: 1 | -1) => {
      if (rows.length === 0) {
        return;
      }
      setActiveIndex((prev) => {
        let next = prev;
        for (let i = 0; i < rows.length; i++) {
          next = (next + direction + rows.length) % rows.length;
          if (isSelectable(rows[next])) {
            return next;
          }
        }
        return prev;
      });
    },
    [rows],
  );

  const activate = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || row.type === 'header') {
        return;
      }
      if (row.type === 'attach') {
        popover.hide();
        row.entry.onSelect();
        return;
      }
      /* Terminal like an upload destination: the file lands in the tray, which
         the open palette is covering. */
      if (row.type === 'file') {
        popover.hide();
        recent.attach(row.file);
        return;
      }
      /* Every catalog row is a toggle, so the palette stays open and several can
         be flipped in one visit. Only an attach destination, which hands off to
         a file picker, dismisses it. */
      row.entry.onSelect();
    },
    [rows, popover, recent],
  );

  const toggleFavoriteAt = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row || row.type !== 'entry') {
        return;
      }
      favorites.toggleFavorite(row.entry.itemType, row.entry.itemId);
    },
    [rows, favorites],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        step(-1);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        activate(activeIndex);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        toggleFavoriteAt(activeIndex);
        return;
      }
      if (e.key === 'Backspace' && search === '') {
        popover.hide();
        return;
      }
      if (e.key === 'Escape') {
        popover.hide();
      }
    },
    [step, activate, activeIndex, toggleFavoriteAt, search, popover],
  );

  const rowRenderer = useCallback(
    ({ index, key, style }: { index: number; key: string; style: React.CSSProperties }) => {
      const row = rows[index];
      if (row.type === 'header') {
        return (
          <div
            key={key}
            style={style}
            role="presentation"
            className="flex items-end px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary"
          >
            {row.label}
          </div>
        );
      }

      const isActive = index === activeIndex;

      if (row.type === 'file') {
        const { file } = row;
        return (
          <div
            key={key}
            style={style}
            id={`palette-row-${index}`}
            role="option"
            aria-selected={isActive}
            onClick={() => activate(index)}
            onMouseEnter={() => setActiveIndex(index)}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-text-secondary',
              isActive && 'bg-surface-hover',
            )}
          >
            {/* Painted as a background rather than an `img`: these thumbnails
                are often unreachable (remote storage, expired links), and a
                background degrades to an empty tile instead of a broken glyph. */}
            {file.type?.startsWith('image') === true ? (
              <span
                aria-hidden="true"
                style={{ backgroundImage: `url(${file.filepath})` }}
                className="size-7 shrink-0 rounded-md bg-surface-tertiary bg-cover bg-center"
              />
            ) : (
              <FilePreview
                file={file}
                fileType={getFileType(file.type)}
                className="size-7 rounded-md"
              />
            )}
            <span className="flex min-w-0 flex-1 flex-col justify-center">
              <span className="truncate">{file.filename}</span>
              <span className="truncate text-xs text-text-secondary opacity-80">
                {formatFileDate(file)}
              </span>
            </span>
          </div>
        );
      }

      const isEntry = row.type === 'entry';
      const { label, icon } = row.entry;
      const description = isEntry ? row.entry.description : undefined;
      const checked = isEntry ? row.entry.active : false;
      const favorited = isEntry && row.isFavorite;
      const modes = isEntry ? row.entry.modes : undefined;
      const accent = isEntry ? row.entry.accent : undefined;

      return (
        <div
          key={key}
          style={style}
          id={`palette-row-${index}`}
          role="option"
          aria-selected={isActive}
          aria-checked={isEntry ? checked : undefined}
          aria-label={
            favorited ? `${label}, ${localize('com_ui_tools_view_favorites')}` : undefined
          }
          onClick={() => activate(index)}
          onMouseEnter={() => setActiveIndex(index)}
          className={cn(
            'group/row relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm',
            /* On-state reads as a left accent plus full-strength text, rather
               than a tick competing with the keyboard highlight for meaning. */
            checked ? 'text-text-primary' : 'text-text-secondary',
            isActive && 'bg-surface-hover',
          )}
        >
          {checked && (
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-text-primary"
            />
          )}
          <span
            className={cn(
              'shrink-0',
              accent ?? (checked ? 'text-text-primary' : 'text-text-secondary'),
            )}
            aria-hidden="true"
          >
            {icon}
          </span>
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className={cn('truncate', checked && 'font-medium')}>{label}</span>
            {description != null && description !== '' && (
              <span className="truncate text-xs text-text-secondary opacity-80">{description}</span>
            )}
          </span>
          {/* Modes ride on the parent row rather than a row of their own. Pointer
              only, like the star — an `option` must not own focusable children;
              the chip in the bar carries the keyboard-reachable equivalent. */}
          {modes != null &&
            modes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                tabIndex={-1}
                aria-hidden="true"
                onClick={(e) => {
                  e.stopPropagation();
                  mode.onSelect();
                }}
                className={cn(
                  'shrink-0 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  mode.active
                    ? 'border-transparent bg-surface-active-alt text-text-primary'
                    : 'border-border-medium text-text-secondary hover:bg-surface-hover hover:text-text-primary',
                )}
              >
                {mode.label}
              </button>
            ))}
          {isEntry && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={(e) => {
                e.stopPropagation();
                favorites.toggleFavorite(row.entry.itemType, row.entry.itemId);
              }}
              className={cn(
                'shrink-0 rounded p-1 transition-colors',
                favorited
                  ? 'text-amber-500 hover:text-amber-600'
                  : 'text-text-secondary opacity-0 hover:text-text-primary group-hover/row:opacity-100',
              )}
            >
              <Star
                className="h-4 w-4"
                fill={favorited ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
            </button>
          )}
        </div>
      );
    },
    [rows, activeIndex, activate, favorites, localize],
  );

  return (
    <>
      <FileUpload ref={attach.inputRef} handleFileChange={attach.onFileChange}>
        {/* Opens downward like the thinking popup; Ariakit flips it above on
            its own once the composer sits too low for it to fit below. */}
        <Ariakit.PopoverProvider store={popover}>
          {/* The disclosure is the outer component and the tooltip is what it
              renders through, not the other way round: passing a
              `PopoverDisclosure` as `TooltipAnchor`'s `render` swallowed the
              disclosure's own click handler and the popover never opened. */}
          <Ariakit.PopoverDisclosure
            ref={disclosureRef}
            disabled={disabled}
            aria-label={localize('com_ui_composer_palette')}
            render={
              <TooltipAnchor
                description={localize('com_ui_composer_palette')}
                render={<button type="button" />}
              />
            }
            data-testid="composer-palette-button"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
              'disabled:cursor-not-allowed disabled:opacity-40',
              open && 'bg-surface-hover text-text-primary',
            )}
          >
            {/* The same glyph turned a quarter of the way round is the close
                mark, so the button reads as one control changing state rather
                than two icons swapping. */}
            <Plus
              className={cn('animate-composer-icon size-5', open && 'rotate-45')}
              aria-hidden="true"
            />
          </Ariakit.PopoverDisclosure>
          <Ariakit.Popover
            portal
            fixed
            gutter={POPOVER_GUTTER}
            ref={popoverRef}
            unmountOnHide
            initialFocus={inputRef}
            /* Without this the trigger could not close the palette: mousedown on
               it counts as "outside", so Ariakit hid the popup and the button's
               own click immediately re-opened it. */
            hideOnInteractOutside={(event) =>
              !disclosureRef.current?.contains(event.target as Node)
            }
            /* Anchored to the composer, not the `+` button, so the menu spans
               the composer's width and sits flush above it. */
            getAnchorRect={() => anchorRef.current?.getBoundingClientRect() ?? null}
            aria-label={localize('com_ui_composer_palette')}
            style={{ width: 'var(--popover-anchor-width)' }}
            className="animate-composer-popover z-50 flex max-w-[95vw] flex-col overflow-hidden rounded-2xl border border-border-light bg-presentation shadow-lg outline-none"
          >
            <div className="flex items-center gap-2 border-b border-border-light px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded
                autoComplete="off"
                aria-controls="composer-palette-list"
                aria-activedescendant={rows.length > 0 ? `palette-row-${activeIndex}` : undefined}
                aria-describedby="composer-palette-help"
                placeholder={localize('com_ui_composer_palette_search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="composer-palette-search"
                className="w-full border-0 bg-transparent text-sm text-text-primary shadow-none ring-0 placeholder:text-text-secondary focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
              <span id="composer-palette-help" className="sr-only">
                {localize('com_ui_composer_palette_help')}
              </span>
            </div>
            {rows.length === 0 ? (
              <div className="px-2 py-6 text-center text-sm text-text-secondary">
                {localize('com_ui_composer_no_results')}
              </div>
            ) : (
              <div
                id="composer-palette-list"
                role="listbox"
                aria-label={localize('com_ui_composer_palette')}
                className="p-1.5"
              >
                <AutoSizer disableHeight>
                  {({ width }) => (
                    <List
                      width={width}
                      overscanRowCount={8}
                      rowCount={rows.length}
                      scrollToIndex={activeIndex}
                      rowRenderer={rowRenderer}
                      rowHeight={({ index }) => rowHeight(rows[index])}
                      height={Math.min(totalHeight, LIST_MAX_HEIGHT)}
                      className={cn(
                        'focus:outline-none',
                        totalHeight > LIST_MAX_HEIGHT && 'palette-scroll',
                      )}
                    />
                  )}
                </AutoSizer>
              </div>
            )}
          </Ariakit.Popover>
        </Ariakit.PopoverProvider>
      </FileUpload>
      <SharePointPickerDialog
        isOpen={attach.isSharePointDialogOpen}
        onOpenChange={attach.setIsSharePointDialogOpen}
        onFilesSelected={attach.onSharePointFilesSelected}
        isDownloading={attach.isProcessing}
        downloadProgress={attach.downloadProgress}
        maxSelectionCount={attach.maxSelectionCount}
      />
    </>
  );
}

export default memo(Palette);
