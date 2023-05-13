import { Search } from 'lucide-react';
import { useRecoilState } from 'recoil';
import store from '~/store';

export default function SearchBar({ clearSearch }) {

  const [searchQuery, setSearchQuery] = useRecoilState(store.searchQuery);

  const handleKeyUp = () => {
    const { value } = e.target;
    if (e.keyCode === 8 && value === '') {
      setSearchQuery('');
      clearSearch();
    }
  };

  return (
    <div className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10">
      {<Search className="h-4 w-4" />}
      <input
        type="text"
        className="m-0 mr-0 w-full border-none bg-transparent p-0 text-sm leading-tight outline-none"
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        placeholder="Search messages"
        onKeyUp={handleKeyUp}
      />
    </div>
  );
}
