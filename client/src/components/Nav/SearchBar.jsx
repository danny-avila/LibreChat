import React, { useCallback, useState } from 'react';
import { debounce } from 'lodash';
import { Search } from 'lucide-react';
import { useSetRecoilState } from 'recoil';

import store from '~/store';

export default function SearchBar({ fetch, clearSearch }) {
  // const dispatch = useDispatch();
  const [inputValue, setInputValue] = useState('');
  const setSearchQuery = useSetRecoilState(store.searchQuery);

  // const [inputValue, setInputValue] = useState('');

  const debouncedChangeHandler = useCallback(
    debounce(q => {
      setSearchQuery(q);
      if (q.length > 0) {
        fetch(q, 1);
      }
    }, 750),
    [setSearchQuery]
  );

  const handleKeyUp = e => {
    const { value } = e.target;
    if (e.keyCode === 8 && value === '') {
      // Value after clearing input: ""
      console.log(`Value after clearing input: "${value}"`);
      setSearchQuery('');
      clearSearch();
    }
  };

  const changeHandler = e => {
    let q = e.target.value;
    setInputValue(q);
    q = q.trim();

    if (q === '') {
      setSearchQuery('');
      clearSearch();
    } else {
      debouncedChangeHandler(q);
    }
  };

  return (
    <div className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10">
      {<Search className="h-4 w-4" />}
      <input
        // ref={inputRef}
        type="text"
        className="m-0 mr-0 w-full border-none bg-transparent p-0 text-sm leading-tight outline-none"
        value={inputValue}
        onChange={changeHandler}
        placeholder="Search messages"
        onKeyUp={handleKeyUp}
        // onBlur={onRename}
      />
    </div>
  );
}
