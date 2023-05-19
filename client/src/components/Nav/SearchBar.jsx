import { Search, X } from 'lucide-react';
import { useRecoilState } from 'recoil';
import store from '~/store';
import { cn } from '~/utils/index.jsx';

export default function SearchBar({ clearSearch }) {
  const [searchQuery, setSearchQuery] = useRecoilState(store.searchQuery);
  const hasValue = searchQuery.length > 0;

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
    <div className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10">
      <Search className={cn("h-4 w-4", hasValue && 'h-[19px] w-[19px]')} />
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
      {hasValue && <X className="h-5 w-5" onClick={() => setSearchQuery('')} />}
    </div>
  );
  
}
