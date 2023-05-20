import { forwardRef, useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import store from '~/store';

const SearchBar = forwardRef((props, ref) => {
  const { clearSearch } = props;
  const [searchQuery, setSearchQuery] = useRecoilState(store.searchQuery);
  const [showClearIcon, setShowClearIcon] = useState(false);

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
    setShowClearIcon(value.length > 0);
  };

  useEffect(() => {
    if (searchQuery.length === 0) {
      setShowClearIcon(false);
    } else {
      setShowClearIcon(true);
    }
  }, [searchQuery])
  

  return (
    <div
      ref={ref}
      className="flex w-full cursor-pointer items-center gap-3 px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-700 relative"
    >
      {<Search className="h-4 w-4 absolute left-3" />}
      <input
        type="text"
        className="m-0 mr-0 w-full border-none bg-transparent p-0 text-sm leading-tight outline-none pl-7"
        value={searchQuery}
        onChange={onChange}
        onKeyDown={(e) => {
          e.code === 'Space' ? e.stopPropagation() : null;
        }}
        placeholder="Search messages"
        onKeyUp={handleKeyUp}
      />
      <X
        className={`h-5 w-5 absolute right-3 cursor-pointer ${showClearIcon ? 'opacity-100' : 'opacity-0'} transition-opacity duration-1000`}
        onClick={() => {
          setSearchQuery('');
          clearSearch();
        }}
      />
    </div>
  );
});

export default SearchBar;