import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { useRecoilState } from 'recoil';
import store from '~/store';

const SearchBar = forwardRef(({ clearSearch }) => {
  const [searchQuery, setSearchQuery] = useRecoilState(store.searchQuery);

  const handleKeyUp = (e) => {
    const { value } = e.target;
    if (e.keyCode === 8 && value === '') {
      setSearchQuery('');
      clearSearch();
    }
  };

  const onChange = (e) => {
    const { value } = e.target;
    setSearchQuery(value);
  };

  return (
    <div className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700">
      {<Search className="h-4 w-4" />}
      <input
        type="text"
        className="m-0 mr-0 w-full border-none bg-transparent p-0 text-sm leading-tight outline-none"
        value={searchQuery}
        onChange={onChange}
        onKeyDown={(e) => {
          e.code === 'Space' ? e.stopPropagation() : null;
        }}
        placeholder="Search messages"
        onKeyUp={handleKeyUp}
      />
    </div>
  );
});

export default SearchBar;