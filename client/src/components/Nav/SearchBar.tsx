import { forwardRef, useState, useCallback, useMemo, Ref } from 'react';
import { Search, X } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import debounce from 'lodash/debounce';
import { useLocalize } from '~/hooks';
import store from '~/store';

type SearchBarProps = {
  clearSearch: () => void;
};

const SearchBar = forwardRef((props: SearchBarProps, ref: Ref<HTMLDivElement>) => {
  const { clearSearch } = props;
  const setSearchQuery = useSetRecoilState(store.searchQuery);
  const [showClearIcon, setShowClearIcon] = useState(false);
  const [text, setText] = useState('');
  const localize = useLocalize();

  const clearText = useCallback(() => {
    setShowClearIcon(false);
    setSearchQuery('');
    clearSearch();
    setText('');
  }, [setSearchQuery, clearSearch]);

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const { value } = e.target as HTMLInputElement;
    if (e.key === 'Backspace' && value === '') {
      clearText();
    }
  };

  const sendRequest = useCallback((value: string) => setSearchQuery(value), [setSearchQuery]);
  const debouncedSendRequest = useMemo(() => debounce(sendRequest, 350), [sendRequest]);

  const onChange = (e: React.FormEvent<HTMLInputElement>) => {
    const { value } = e.target as HTMLInputElement;
    setShowClearIcon(value.length > 0);
    setText(value);
    debouncedSendRequest(value);
  };

  return (
    <div
      ref={ref}
      className="relative flex w-full cursor-pointer items-center gap-3 rounded-md border border-white/20 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
    >
      {<Search className="absolute left-3 h-4 w-4" />}
      <input
        type="text"
        className="m-0 mr-0 w-full border-none bg-transparent p-0 pl-7 text-sm leading-tight outline-none"
        value={text}
        onChange={onChange}
        onKeyDown={(e) => {
          e.code === 'Space' ? e.stopPropagation() : null;
        }}
        placeholder={localize('com_nav_search_placeholder')}
        onKeyUp={handleKeyUp}
      />
      <X
        className={`absolute right-3 h-5 w-5 cursor-pointer ${
          showClearIcon ? 'opacity-100' : 'opacity-0'
        } transition-opacity duration-1000`}
        onClick={clearText}
      />
    </div>
  );
});

export default SearchBar;
