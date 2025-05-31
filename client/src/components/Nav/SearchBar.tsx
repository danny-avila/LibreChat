import React, { forwardRef, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import debounce from 'lodash/debounce';
import { useRecoilState } from 'recoil';
import { Search, X } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
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

  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const [showClearIcon, setShowClearIcon] = useState(false);

  const { newConversation } = useNewConvo();
  const [search, setSearchState] = useRecoilState(store.search);

  const clearSearch = useCallback(() => {
    if (location.pathname.includes('/search')) {
      newConversation({ disableFocus: true });
      navigate('/c/new', { replace: true });
    }
  }, [newConversation, location.pathname, navigate]);

  const clearText = useCallback(() => {
    setShowClearIcon(false);
    setText('');
    setSearchState((prev) => ({
      ...prev,
      query: '',
      debouncedQuery: '',
      isTyping: false,
    }));
    clearSearch();
    inputRef.current?.focus();
  }, [setSearchState, clearSearch]);

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { value } = e.target as HTMLInputElement;
    if (e.key === 'Backspace' && value === '') {
      clearText();
    }
  };

  const sendRequest = useCallback(
    (value: string) => {
      if (!value) {
        return;
      }
      queryClient.invalidateQueries([QueryKeys.messages]);
    },
    [queryClient],
  );

  const debouncedSetDebouncedQuery = useMemo(
    () =>
      debounce((value: string) => {
        setSearchState((prev) => ({ ...prev, debouncedQuery: value, isTyping: false }));
        sendRequest(value);
      }, 500),
    [setSearchState, sendRequest],
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
    } else if (value.length === 0 && location.pathname === '/search') {
      navigate('/c/new', { replace: true });
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
      className={cn(
        'group relative mt-1 flex h-10 cursor-pointer items-center gap-3 rounded-lg border-border-medium px-3 py-2 text-text-primary transition-colors duration-200 focus-within:bg-surface-hover hover:bg-surface-hover',
        isSmallScreen === true ? 'mb-2 h-14 rounded-xl' : '',
      )}
    >
      <Search className="absolute left-3 h-4 w-4 text-text-secondary group-focus-within:text-text-primary group-hover:text-text-primary" />
      <input
        type="text"
        ref={inputRef}
        className="m-0 mr-0 w-full border-none bg-transparent p-0 pl-7 text-sm leading-tight placeholder-text-secondary placeholder-opacity-100 focus-visible:outline-none group-focus-within:placeholder-text-primary group-hover:placeholder-text-primary"
        value={text}
        onChange={onChange}
        onKeyDown={(e) => {
          e.code === 'Space' ? e.stopPropagation() : null;
        }}
        aria-label={localize('com_nav_search_placeholder')}
        placeholder={localize('com_nav_search_placeholder')}
        onKeyUp={handleKeyUp}
        onFocus={() => setSearchState((prev) => ({ ...prev, isSearching: true }))}
        onBlur={() => setSearchState((prev) => ({ ...prev, isSearching: false }))}
        autoComplete="off"
        dir="auto"
      />
      <button
        type="button"
        aria-label={`${localize('com_ui_clear')} ${localize('com_ui_search')}`}
        className={cn(
          'absolute right-[7px] flex h-5 w-5 items-center justify-center rounded-full border-none bg-transparent p-0 transition-opacity duration-200',
          showClearIcon ? 'opacity-100' : 'opacity-0',
          isSmallScreen === true ? 'right-[16px]' : '',
        )}
        onClick={clearText}
        tabIndex={showClearIcon ? 0 : -1}
        disabled={!showClearIcon}
      >
        <X className="h-5 w-5 cursor-pointer" />
      </button>
    </div>
  );
});

export default SearchBar;
