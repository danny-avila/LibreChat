import React, { forwardRef, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilState } from 'recoil';
import { Search, X } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useShortcutAriaKey } from '~/hooks/useKeyboardShortcuts';
import { useLocalize, useNewConvo } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

type SearchBarProps = {
  isSmallScreen?: boolean;
};

const SearchBar = forwardRef((props: SearchBarProps, ref: React.Ref<HTMLDivElement>) => {
  const localize = useLocalize();
  const location = useLocation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isSmallScreen } = props;

  const { newConversation: newConvo } = useNewConvo();
  const [search, setSearchState] = useRecoilState(store.search);

  /**
   * Seeded from the stored query rather than blank. The field is mounted in
   * two places — the list on a pointer device, the drawer's bottom bar on
   * touch — so crossing the breakpoint mid-search destroys one instance and
   * builds another. Starting empty would leave the results still filtered by a
   * query the box no longer shows, with no clear affordance to undo it.
   */
  const [text, setText] = useState(() => search.query ?? '');
  const inputRef = useRef<HTMLInputElement>(null);
  const [showClearIcon, setShowClearIcon] = useState(() => (search.query ?? '').length > 0);
  const focusSearchAriaKey = useShortcutAriaKey('focusSearch');

  const clearSearch = useCallback(
    (pathname?: string) => {
      if (pathname?.includes('/search') || pathname === '/c/new') {
        queryClient.removeQueries([QueryKeys.messages]);
        newConvo({ disableFocus: true });
        navigate('/c/new');
      }
    },
    [newConvo, navigate, queryClient],
  );

  const sendRequest = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }
      queryClient.invalidateQueries([QueryKeys.messages]);
    },
    [queryClient],
  );

  const commitQuery = useRef<(value: string) => void>(() => undefined);
  commitQuery.current = (value: string) => {
    setSearchState((prev) => ({ ...prev, debouncedQuery: value, isTyping: false }));
    sendRequest(value);
  };

  /**
   * One instance for the lifetime of the field, reading the current handlers
   * through the ref, so `cancel` always reaches the timer that is actually
   * pending. Rebuilding the debounce whenever its dependencies changed would
   * leave the previous instance's timer running past the cancel meant to stop
   * it, and cancelling on that rebuild would instead discard live keystrokes.
   */
  const debouncedSetDebouncedQuery = useMemo(
    () => debounce((value: string) => commitQuery.current(value), 500),
    [],
  );

  /**
   * The commit writes to shared state, so a timer left running outlives the
   * field that scheduled it. This one publishes instead of discarding, because
   * the field can leave with work pending and no successor to inherit it: the
   * bottom bar drops the search entirely when you switch panels, and abandoning
   * the commit there would strand `isTyping` with results the box no longer
   * matches. Flushing is synchronous with the unmount, so it lands before any
   * edit a replacement field might make and cannot overwrite one.
   */
  useEffect(() => () => debouncedSetDebouncedQuery.flush(), [debouncedSetDebouncedQuery]);

  const clearText = useCallback(
    (pathname?: string) => {
      debouncedSetDebouncedQuery.cancel();
      setShowClearIcon(false);
      setText('');
      setSearchState((prev) => ({
        ...prev,
        query: '',
        debouncedQuery: '',
        isTyping: false,
      }));
      clearSearch(pathname);
      inputRef.current?.focus();
    },
    [setSearchState, clearSearch, debouncedSetDebouncedQuery],
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      const { value } = e.target as HTMLInputElement;
      if (e.key === 'Backspace' && value === '') {
        clearText(location.pathname);
      }
    },
    [clearText, location.pathname],
  );

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setShowClearIcon(value.length > 0);
    setText(value);
    setSearchState((prev) => ({
      ...prev,
      query: value,
      isTyping: true,
    }));
    debouncedSetDebouncedQuery(value);
    if (value.length > 0 && location.pathname !== '/search') {
      navigate('/search', { replace: true });
    }
  };

  // Automatically set isTyping to false when loading is done and debouncedQuery matches query
  // (prevents stuck loading state if input is still focused)
  useEffect(() => {
    if (search.isTyping && !search.isSearching && search.debouncedQuery === search.query) {
      setSearchState((prev) => ({ ...prev, isTyping: false }));
    }
  }, [search.isTyping, search.isSearching, search.debouncedQuery, search.query, setSearchState]);

  return (
    <div
      ref={ref}
      className="group relative flex h-9 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border-2 border-transparent px-3 py-1.5 text-text-primary focus-within:border-ring-primary focus-within:bg-surface-active-alt hover:bg-surface-active-alt"
    >
      <Search
        aria-hidden="true"
        className="absolute left-3 h-4 w-4 text-text-secondary group-focus-within:text-text-primary group-hover:text-text-primary"
      />
      <input
        type="text"
        data-testid="nav-search-input"
        ref={inputRef}
        className="m-0 mr-0 w-full border-none bg-transparent p-0 pl-7 text-sm leading-tight placeholder-text-secondary placeholder-opacity-100 focus-visible:outline-none group-focus-within:placeholder-text-primary group-hover:placeholder-text-primary"
        value={text}
        onChange={onChange}
        onKeyDown={(e) => {
          e.code === 'Space' ? e.stopPropagation() : null;
        }}
        aria-label={localize('com_nav_search_placeholder')}
        aria-keyshortcuts={focusSearchAriaKey}
        placeholder={localize('com_nav_search_placeholder')}
        onKeyUp={handleKeyUp}
        onFocus={() => setSearchState((prev) => ({ ...prev, isSearching: true }))}
        onBlur={() => setSearchState((prev) => ({ ...prev, isSearching: false }))}
        autoComplete="off"
        dir="auto"
      />
      <button
        type="button"
        aria-label={localize('com_ui_clear_search')}
        className={cn(
          'absolute right-[0.4375rem] flex h-5 w-5 items-center justify-center rounded-full border-none bg-transparent p-0 transition-opacity duration-200',
          showClearIcon ? 'opacity-100' : 'opacity-0',
          isSmallScreen === true ? 'right-[1rem]' : '',
        )}
        onClick={() => clearText(location.pathname)}
        tabIndex={showClearIcon ? 0 : -1}
        disabled={!showClearIcon}
      >
        <X className="h-5 w-5 cursor-pointer" aria-hidden="true" />
      </button>
    </div>
  );
});

export default SearchBar;
