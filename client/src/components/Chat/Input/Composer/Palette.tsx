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
import { AutoSizer, List } from 'react-virtualized';
import { FileUpload, TooltipAnchor } from '@librechat/client';
import { Star, Plus, Search, ChevronDown } from 'lucide-react';
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
import useReducedMotion from '~/hooks/Generic/useReducedMotion';
import useToolFavorites from '~/hooks/Input/useToolFavorites';
import useElementSize from '~/hooks/Generic/useElementSize';
import useRecentFiles from '~/hooks/Input/useRecentFiles';
import useAttachItems from '~/hooks/Input/useAttachItems';
import { isMacPlatform } from '~/utils/shortcuts';
import { getFileType, cn } from '~/utils';
import { useLocalize } from '~/hooks';

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
/** How long the folded destinations take to fade before they give up their
 *  space; matches `.animate-palette-row-out` in `style.css`. */
const ROW_FADE_MS = 110;
const MORE_ROW_KEY = 'attach:more';
/** How long a row takes to reach a new offset, and on what curve. */
const ROW_SHIFT_MS = 260;
const ROW_SHIFT_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
/** Separator for the row-set signature; cannot occur in a row key. */
const KEY_SEP = '\u0000';
const NO_ENTERING: ReadonlySet<string> = new Set();
const NO_ROWS: PaletteRow[] = [];
/** Spelled out for the platform, since this is read aloud: "Mod" is a
 *  developer's shorthand and not a key on anybody's keyboard. */
const FAVORITE_MODIFIER = isMacPlatform ? '\u2318' : 'Ctrl';

/** A row's element id, derived from its identity so the combobox keeps naming
 *  the same row as the list rearranges under it. */
const rowElementId = (key: string) => `palette-row-${key.replace(/[^\w:-]/g, '_')}`;

const SECTION_LABEL: Record<PaletteSection, TranslationKeys> = {
  tool: 'com_ui_composer_tools',
  skill: 'com_ui_skills',
  mcp: 'com_ui_composer_mcp',
};

type PaletteRow =
  | { type: 'header'; key: string; label: string }
  | { type: 'attach'; key: string; entry: AttachEntry }
  | { type: 'more'; key: string; label: string }
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
  /** A recording is running: the button drops the take instead of opening the
   *  palette, and its glyph turns into the close mark to say so. */
  dictating?: boolean;
  onCancel?: () => void;
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
  dictating = false,
  onCancel,
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
  /* Kept across openings rather than reset with the search: someone who uploads
     to a tool once will do it again, and re-expanding every time is the cost of
     hiding it. */
  const [showAllAttach, setShowAllAttach] = useState(false);
  /* Closing runs in two beats, so the rows below never slide up through a hole
     where the folded destinations used to be: they fade where they stand, and
     only once they are gone does the list close over them. */
  const [collapsing, setCollapsing] = useState(false);
  /* What the disclosure says it is: the moment it is clicked shut it reads as
     closed, while the rows it is closing over are still fading out. */
  const expanded = showAllAttach && !collapsing;
  /* The row itself, not where it currently sits. A row that moves — starred
     into favourites, pushed down by a disclosure — keeps the highlight, and the
     id the combobox points at keeps naming something that exists. */
  const [activeKey, setActiveKey] = useState('');
  /* Only a keyboard move scrolls the list. Driving this from the highlight
     alone let hovering a half-visible row scroll it into view, which moved the
     rows under a resting pointer. */
  const [scrollToActive, setScrollToActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<List>(null);
  const listBodyRef = useRef<HTMLDivElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const setLift = useSetRecoilState(store.composerLiftFamily(index));
  const { ref: popoverRef, height: popupHeight } = useElementSize<HTMLDivElement>();
  const reducedMotion = useReducedMotion();

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

  /* The popup stays "mounted" through its leave transition, so a composer
     unmounted inside that window never reaches the reset below and leaves the
     landing screen holding a lift with no popup under it. */
  useEffect(() => () => setLift(0), [setLift]);

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
  const recent = useRecentFiles(mounted && canAttach, { files, setFiles, conversation });
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
    /* The disclosure button lives here too, so this component stays mounted for
       the whole conversation. Deriving the list while the popup is down meant
       walking the entire catalog on every keystroke in the message box, for
       rows nobody was looking at. */
    if (!mounted) {
      return NO_ROWS;
    }
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
      /* Searching reaches every destination: the disclosure is there to keep the
         resting list short, not to make a row unfindable by name. */
      const matched =
        query === ''
          ? attach.entries.filter((item) => showAllAttach || item.primary === true)
          : attach.entries.filter((item) => item.label.toLowerCase().includes(query));
      const folded = query === '' && attach.entries.some((item) => item.primary !== true);
      if (matched.length > 0 || folded) {
        next.push({ type: 'header', key: 'h:attach', label: localize('com_ui_composer_attach') });
        for (const entry of matched) {
          next.push({ type: 'attach', key: entry.id, entry });
        }
        if (folded) {
          next.push({
            type: 'more',
            key: MORE_ROW_KEY,
            /* The label carries the state rather than `aria-expanded`, which an
               `option` may not have: the word is what a screen reader reads and
               what a sighted user sees, so neither has to infer it from the
               chevron alone. */
            label: expanded
              ? localize('com_ui_composer_attach_less')
              : localize('com_ui_composer_attach_more'),
          });
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

    pushSection('tool');
    pushSection('skill');
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
  }, [
    mounted,
    entries,
    favorites.keys,
    query,
    attach.entries,
    showAllAttach,
    expanded,
    recent.files,
    canAttach,
    localize,
  ]);

  /** Where every row sits and how tall the list is, in one pass. */
  const layout = useMemo(() => {
    const tops = new Map<string, number>();
    let height = 0;
    for (const row of rows) {
      tops.set(row.key, height);
      height += rowHeight(row);
    }
    return { tops, height };
  }, [rows]);

  /** The row set itself, ignoring anything that changes inside a row. */
  const signature = useMemo(() => rows.map((row) => row.key).join(KEY_SEP), [rows]);

  /* Rows that gain or lose a neighbour travel to their new offsets, and the
     rows that caused it fade in where they land. Any change to the row set
     earns this — a starred entry moving up into favourites, an upload landing
     in the files section, the attach disclosure folding — except one: a change
     that came with the query. Under a search the list is being replaced rather
     than rearranged, and sliding one set of contents into the place of another
     reads as the list lagging behind the typing.

     Written as a suppression rather than as an opt-in so that the ordinary
     case needs no signal to reach the move: anything that rearranges the list,
     from anywhere, is carried by it. */
  const [settled, setSettled] = useState({ signature, query });
  const [entering, setEntering] = useState<ReadonlySet<string>>(NO_ENTERING);
  const [instant, setInstant] = useState(false);
  if (settled.signature !== signature) {
    const rearranged = settled.query === query;
    setSettled({ signature, query });
    setInstant(!rearranged);
    if (!rearranged) {
      setEntering(NO_ENTERING);
    } else {
      const before = new Set(settled.signature.split(KEY_SEP));
      const arrived = new Set<string>();
      for (const row of rows) {
        if (!before.has(row.key)) {
          arrived.add(row.key);
        }
      }
      setEntering(arrived);
    }
  }

  /* Held for the one frame the suppressed change is drawn in, so the next
     rearrangement moves rather than jumps. */
  useEffect(() => {
    if (!instant) {
      return;
    }
    const frame = requestAnimationFrame(() => setInstant(false));
    return () => cancelAnimationFrame(frame);
  }, [instant]);

  /* Two things happen here, both after the list has already been redrawn.

     The list measures each row once and keeps the offsets, so a row that
     changes height in place — a two-line entry starred into a section that
     starts one row higher — is drawn at a stale offset and lands on top of its
     neighbour. Only the widget holds that cache, so only the widget can drop
     it.

     Then every row that changed place is sent back to where it was and let go,
     which is the only way to move these rows that survives what starring one
     does to the DOM. A row jumping from its section up into favourites makes
     React re-insert every row it passed, and a re-inserted node loses the
     transition it was about to run: starring an entry jumped while unstarring
     the same entry animated. Playing the move after the re-insertion, rather
     than asking the browser to notice it, is what makes the two symmetric. */
  const previousTops = useRef(layout.tops);
  const measuredSignature = useRef(signature);
  useLayoutEffect(() => {
    /* Dropping the cache re-walks every offset from the top of the list, so it
       is worth doing only when the rows themselves changed. */
    if (measuredSignature.current !== signature) {
      measuredSignature.current = signature;
      listRef.current?.recomputeRowHeights(0);
    }
    const before = previousTops.current;
    previousTops.current = layout.tops;
    const body = listBodyRef.current;
    /* Where there is no Web Animations API to play the move with, the rows just
       arrive where they belong — the same as asking for no motion. */
    if (instant || body == null || typeof body.animate !== 'function' || reducedMotion) {
      return;
    }
    for (const element of body.querySelectorAll<HTMLElement>('[data-row-key]')) {
      const key = element.dataset.rowKey;
      const from = key == null ? undefined : before.get(key);
      const to = key == null ? undefined : layout.tops.get(key);
      if (from == null || to == null || from === to) {
        continue;
      }
      element.animate([{ transform: `translateY(${from - to}px)` }, { transform: 'none' }], {
        duration: ROW_SHIFT_MS,
        easing: ROW_SHIFT_EASING,
      });
    }
  }, [layout, signature, instant, reducedMotion]);

  /** Second beat of the close: the faded rows give up their space. */
  useEffect(() => {
    if (!collapsing) {
      return;
    }
    const timer = window.setTimeout(() => {
      setCollapsing(false);
      setShowAllAttach(false);
    }, ROW_FADE_MS);
    return () => window.clearTimeout(timer);
  }, [collapsing]);

  const firstSelectable = useMemo(() => rows.findIndex(isSelectable), [rows]);

  /** Where the active row sits now, falling back to the first row that can be
   *  chosen once the query has filtered the old one away. */
  const activeIndex = useMemo(() => {
    const found = activeKey === '' ? -1 : rows.findIndex((row) => row.key === activeKey);
    if (found !== -1) {
      return found;
    }
    return firstSelectable === -1 ? 0 : firstSelectable;
  }, [activeKey, rows, firstSelectable]);

  const activeRow = rows[activeIndex];

  /* Stable across renders: the list compares this by identity and throws away
     its whole style cache whenever it changes. */
  const measureRow = useCallback(
    ({ index: row }: { index: number }) => rowHeight(rows[row]),
    [rows],
  );

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
      let next = activeIndex;
      for (let i = 0; i < rows.length; i++) {
        next = (next + direction + rows.length) % rows.length;
        if (isSelectable(rows[next])) {
          setActiveKey(rows[next].key);
          setScrollToActive(true);
          return;
        }
      }
    },
    [rows, activeIndex],
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
      /* Reveals the rest of the section in place, so the palette stays open.
         The disclosure slides down past the rows it just revealed, so the
         highlight is asked to follow it rather than snap back to the top. */
      if (row.type === 'more') {
        if (showAllAttach) {
          setCollapsing(true);
          return;
        }
        setShowAllAttach(true);
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
    [rows, popover, recent, showAllAttach],
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

  /* Keyed by the row's own identity rather than by the index the list hands
     out. Under index keys a row that changes place is a box that stays put
     while its contents are swapped, so nothing about the change is animatable;
     keyed this way the box follows its row and its offset can be moved to. */
  const rowRenderer = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const row = rows[index];
      /* A row that had no neighbour to arrive from — a section header the
         starred entry brought with it, the destinations behind the fold —
         appears where it lands rather than travelling there. */
      const arrived = entering.has(row.key);
      if (row.type === 'header') {
        return (
          <div
            key={row.key}
            data-row-key={row.key}
            style={style}
            role="presentation"
            className={cn(
              'flex items-end px-2 pb-1 text-[11px] font-medium uppercase tracking-wide text-text-secondary',
              arrived && 'animate-palette-row',
            )}
          >
            {row.label}
          </div>
        );
      }

      const isActive = index === activeIndex;

      if (row.type === 'more') {
        return (
          <div
            key={row.key}
            data-row-key={row.key}
            style={style}
            id={rowElementId(row.key)}
            role="option"
            aria-selected={isActive}
            onClick={() => activate(index)}
            onMouseEnter={() => {
              setActiveKey(row.key);
              setScrollToActive(false);
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-text-secondary',
              isActive && 'bg-surface-hover',
              arrived && 'animate-palette-row',
            )}
          >
            <ChevronDown
              aria-hidden="true"
              className={cn('animate-composer-icon size-4 shrink-0', expanded && '-rotate-180')}
            />
            <span className="truncate">{row.label}</span>
          </div>
        );
      }

      if (row.type === 'file') {
        const { file } = row;
        return (
          <div
            key={row.key}
            data-row-key={row.key}
            style={style}
            id={rowElementId(row.key)}
            role="option"
            aria-selected={isActive}
            onClick={() => activate(index)}
            onMouseEnter={() => {
              setActiveKey(row.key);
              setScrollToActive(false);
            }}
            className={cn(
              'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-text-secondary',
              isActive && 'bg-surface-hover',
              arrived && 'animate-palette-row',
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
      /* The folded destinations are the one departure the list can wait for:
         the disclosure is closing them itself, rather than reacting to a change
         that has already happened. */
      const departing = row.type === 'attach' && row.entry.primary !== true && collapsing;
      const { label, icon } = row.entry;
      const description = isEntry ? row.entry.description : undefined;
      const checked = isEntry ? row.entry.active : false;
      const favorited = isEntry && row.isFavorite;
      const modes = isEntry ? row.entry.modes : undefined;
      const accent = isEntry ? row.entry.accent : undefined;

      return (
        <div
          key={row.key}
          data-row-key={row.key}
          style={style}
          id={rowElementId(row.key)}
          role="option"
          aria-selected={isActive}
          aria-checked={isEntry ? checked : undefined}
          aria-label={
            favorited ? `${label}, ${localize('com_ui_tools_view_favorites')}` : undefined
          }
          onClick={() => activate(index)}
          onMouseEnter={() => {
            setActiveKey(row.key);
            setScrollToActive(false);
          }}
          className={cn(
            'group/row relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm',
            /* On-state reads as a left accent plus full-strength text, rather
               than a tick competing with the keyboard highlight for meaning. */
            checked ? 'text-text-primary' : 'text-text-secondary',
            isActive && 'bg-surface-hover',
            arrived && !departing && 'animate-palette-row',
            departing && 'animate-palette-row-out pointer-events-none',
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
          {/* Modes ride on the parent row rather than a row of their own.
              Pointer targets rather than buttons, like the star: an `option`
              must not own focusable children, and a hidden button is still
              click-focusable, which strands a reader inside a hidden subtree.
              The chip in the bar carries the keyboard-reachable equivalent. */}
          {modes != null &&
            modes.map((mode) => (
              <span
                key={mode.id}
                role="presentation"
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
              </span>
            ))}
          {isEntry && (
            <span
              role="presentation"
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
            </span>
          )}
        </div>
      );
    },
    [rows, activeIndex, activate, favorites, localize, expanded, entering, collapsing],
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
            /* The upload-file shortcut resolves its target by id, and this is
               the control that replaced the attach menu it used to click. */
            id="attach-file-menu-button"
            disabled={disabled}
            aria-label={dictating ? localize('com_ui_cancel') : localize('com_ui_composer_palette')}
            /* Kept as the disclosure while dictating rather than swapped for a
               plain cancel button: a swap would mount a fresh element already
               at its final angle, and the turn is the whole point. Ariakit
               honours `defaultPrevented`, so claiming the click here stops the
               popover from opening. */
            onClick={(event) => {
              if (!dictating) {
                return;
              }
              event.preventDefault();
              onCancel?.();
            }}
            render={
              <TooltipAnchor
                description={
                  dictating ? localize('com_ui_cancel') : localize('com_ui_composer_palette')
                }
                render={<button type="button" />}
              />
            }
            data-testid="composer-palette-button"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors',
              'hover:bg-surface-hover hover:text-text-primary',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-opacity-50',
              'disabled:cursor-not-allowed disabled:opacity-40',
              /* The close mark carries the same weight whichever job it is
                 doing: dimmer and unbacked while dictating read as a smaller
                 glyph next to the one the open palette shows. */
              (open || dictating) && 'bg-surface-hover text-text-primary',
            )}
          >
            {/* The same glyph turned a quarter of the way round is the close
                mark, so the button reads as one control changing state rather
                than two icons swapping. */}
            <Plus
              className={cn('animate-composer-icon size-5', (open || dictating) && 'rotate-45')}
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
            {/* The whole row is the search target, not just the input: the icon
                and the padding around it read as part of the field, so clicking
                them has to land in the field too.

                The popup is portaled but still a React descendant of the
                composer box, so its clicks bubble through the React tree into
                the box's own "focus the textarea" handler — which would take
                the focus straight back off the field. */}
            <div
              onClick={(event) => {
                event.stopPropagation();
                inputRef.current?.focus();
              }}
              className="flex cursor-text items-center gap-2 border-b border-border-light px-3 py-2"
            >
              <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden="true" />
              <input
                ref={inputRef}
                role="combobox"
                aria-expanded={rows.length > 0}
                autoComplete="off"
                aria-controls={rows.length > 0 ? 'composer-palette-list' : undefined}
                aria-activedescendant={
                  activeRow != null && isSelectable(activeRow)
                    ? rowElementId(activeRow.key)
                    : undefined
                }
                aria-describedby="composer-palette-help"
                placeholder={localize('com_ui_composer_palette_search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                data-testid="composer-palette-search"
                className="w-full border-0 bg-transparent text-sm text-text-primary shadow-none ring-0 placeholder:text-text-secondary focus:border-0 focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0"
              />
              <span id="composer-palette-help" className="sr-only">
                {localize('com_ui_composer_palette_help', { 0: FAVORITE_MODIFIER })}
              </span>
            </div>
            {rows.length === 0 ? (
              /* A search that matches nothing is a state change with nothing
                 to focus, so it has to be said rather than only drawn. */
              <div
                role="status"
                aria-live="polite"
                className="px-2 py-6 text-center text-sm text-text-secondary"
              >
                {localize('com_ui_composer_no_results')}
              </div>
            ) : (
              <div
                ref={listBodyRef}
                id="composer-palette-list"
                role="listbox"
                aria-label={localize('com_ui_composer_palette')}
                className={cn('palette-rows p-1.5', instant && 'palette-instant')}
              >
                <AutoSizer disableHeight>
                  {({ width }) => (
                    <List
                      ref={listRef}
                      width={width}
                      overscanRowCount={8}
                      rowCount={rows.length}
                      /* The list defaults to a `grid` of `row`s, labelled
                         "grid" in English and holding its own tab stop. Left
                         alone it sits between this listbox and its options, so
                         none of them are owned by it, and it announces a
                         second, empty widget where the rows should be. */
                      role="presentation"
                      containerRole="presentation"
                      aria-label=""
                      tabIndex={-1}
                      scrollToIndex={scrollToActive ? activeIndex : undefined}
                      rowRenderer={rowRenderer}
                      rowHeight={measureRow}
                      height={Math.min(layout.height, LIST_MAX_HEIGHT)}
                      className={cn(
                        'focus:outline-none',
                        layout.height > LIST_MAX_HEIGHT && 'palette-scroll',
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
