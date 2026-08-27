import { memo, useMemo, useCallback } from 'react';
import type { RailEntry, RailWindow } from './Rail';
import { useLocalize } from '~/hooks';
import { Rail } from './Rail';

export interface SearchNavEntry extends RailEntry {
  /** Row position in the virtualized result list, which is the only address
   *  the list understands. */
  index: number;
}

interface SearchNavProps {
  entries: SearchNavEntry[];
  currentIndex: number | null;
  visibleIndices: Set<number>;
  onJump: (index: number, smooth: boolean) => void;
}

const MESSAGES_START_ID = 'search-results-start';

/**
 * The search results' navigation rail.
 *
 * Everything about how the rail behaves — the fisheye, the shared preview, the
 * drag scrub, the roving tab stop, keeping the reader's window framed — belongs
 * to `Rail`, which the transcript's own nav renders too. What is particular to
 * search results is only this: the ribs are addressed by row index rather than
 * by element, and a jump is a scroll request to a virtualized list rather than
 * to a DOM node.
 */
function SearchNav({ entries, currentIndex, visibleIndices, onJump }: SearchNavProps) {
  const localize = useLocalize();

  /** The terminus is pinned beside the chevron rather than scrolled with the
   *  ribs, so it stays reachable however far the column has travelled; the
   *  origin mirrors it. */
  const { rowEntries, endEntry, startEntry } = useMemo(() => {
    const last = entries[entries.length - 1];
    const hasEnd = last?.isEnd === true;
    const rows = hasEnd ? entries.slice(0, -1) : entries;
    return {
      rowEntries: rows,
      endEntry: hasEnd ? last : null,
      startEntry:
        rows.length > 0
          ? { id: MESSAGES_START_ID, index: 0, isUser: false, preview: '', isStart: true }
          : null,
    };
  }, [entries]);

  /** Lookups the scrolling path needs in constant time, built once per result
   *  set rather than rescanned per frame. */
  const { entryById, posByRowIndex } = useMemo(() => {
    const byId = new Map<string, SearchNavEntry>();
    for (let i = 0; i < entries.length; i++) {
      byId.set(entries[i].id, entries[i]);
    }
    if (startEntry) {
      byId.set(startEntry.id, startEntry);
    }
    const byIndex = new Map<number, number>();
    for (let i = 0; i < rowEntries.length; i++) {
      byIndex.set(rowEntries[i].index, i);
    }
    return { entryById: byId, posByRowIndex: byIndex };
  }, [entries, rowEntries, startEntry]);

  /** Array position of the entry the reader is on; the chevrons walk from here. */
  const currentPos = currentIndex == null ? -1 : (posByRowIndex.get(currentIndex) ?? -1);
  const currentId = currentPos >= 0 ? rowEntries[currentPos].id : null;

  /**
   * The lit band and the window the rail frames, from one pass.
   *
   * A new `visibleIndices` set arrives on every change to the virtualized
   * window, so this runs on the scrolling path and its cost grows with every
   * page fetched. `atEnd` asks the rail for its own bottom, which is what
   * reaching the last result should look like.
   */
  const { visibleIds, railWindow } = useMemo(() => {
    const ids = new Set<string>();
    let first = -1;
    let last = -1;
    for (let i = 0; i < rowEntries.length; i++) {
      if (!visibleIndices.has(rowEntries[i].index)) {
        continue;
      }
      ids.add(rowEntries[i].id);
      if (first === -1) {
        first = i;
      }
      last = i;
    }
    const window: RailWindow | null =
      first === -1 ? null : { first, last, atEnd: last === rowEntries.length - 1 };
    return { visibleIds: ids, railWindow: window };
  }, [rowEntries, visibleIndices]);

  const jump = useCallback(
    (id: string, smooth: boolean) => {
      if (id === MESSAGES_START_ID) {
        onJump(0, smooth);
        return;
      }
      const entry = entryById.get(id);
      if (entry) {
        onJump(entry.index, smooth);
      }
    },
    [entryById, onJump],
  );

  const handleSelect = useCallback((id: string) => jump(id, true), [jump]);
  const handleScrub = useCallback((id: string) => jump(id, false), [jump]);

  const jumpToPrevious = useCallback(() => {
    if (currentPos > 0) {
      onJump(rowEntries[currentPos - 1].index, true);
    }
  }, [currentPos, rowEntries, onJump]);

  const jumpToNext = useCallback(() => {
    if (currentPos >= 0 && currentPos < rowEntries.length - 1) {
      onJump(rowEntries[currentPos + 1].index, true);
    }
  }, [currentPos, rowEntries, onJump]);

  const labelFor = useCallback(
    (entry: RailEntry): string => {
      if (entry.isStart === true) {
        return localize('com_ui_scroll_to_top');
      }
      if (entry.isEnd === true) {
        return localize('com_ui_scroll_to_bottom');
      }
      return localize(
        entry.isUser ? 'com_ui_message_nav_go_to_user' : 'com_ui_message_nav_go_to_assistant',
        { 0: entry.preview.slice(0, 30) },
      );
    },
    [localize],
  );

  const previewFor = useCallback(
    (entry: RailEntry): string => {
      if (entry.isStart === true) {
        return localize('com_ui_scroll_to_top');
      }
      if (entry.isEnd === true) {
        return localize('com_ui_scroll_to_bottom');
      }
      return entry.preview !== '' ? entry.preview : localize('com_ui_message_nav_no_preview');
    },
    [localize],
  );

  if (rowEntries.length < 3) {
    return null;
  }

  return (
    <Rail
      ariaLabel={localize('com_ui_search_nav')}
      entries={rowEntries}
      startEntry={startEntry}
      endEntry={endEntry}
      currentId={currentId}
      visibleIds={visibleIds}
      railWindow={railWindow}
      canGoUp={currentPos > 0}
      canGoDown={currentPos >= 0 && currentPos < rowEntries.length - 1}
      previousLabel={localize('com_ui_message_nav_previous')}
      nextLabel={localize('com_ui_message_nav_next')}
      onPrevious={jumpToPrevious}
      onNext={jumpToNext}
      onSelect={handleSelect}
      onScrub={handleScrub}
      labelFor={labelFor}
      previewFor={previewFor}
    />
  );
}

export default memo(SearchNav);
