import React, { useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { useDispatch, useSelector } from 'react-redux';
import { Search } from 'lucide-react';
import { setQuery } from '~/store/searchSlice';
import { setPage, refreshConversation } from '~/store/convoSlice';

export default function SearchBar() {
  const dispatch = useDispatch();
  const [inputValue, setInputValue] = useState('');
  const { search } = useSelector((state) => state.search);

  const debouncedChangeHandler = useCallback(
    debounce((q) => {
      dispatch(setQuery(q));
    }, 750),
    [dispatch]
  );

  const handleKeyUp = (e) => {
    const { value } = e.target;
    if (e.keyCode === 8 && value === '') { 
      // Value after clearing input: ""
      console.log(`Value after clearing input: "${value}"`);
      dispatch(setPage(1));
      dispatch(setQuery(''));
      dispatch(refreshConversation());
     }
  };


  const changeHandler = (e) => {
    if (!search) {
      console.log('setting page to 1');
      dispatch(setPage(1));
    }

    let q = e.target.value;
    setInputValue(q);
    q = q.trim();

    if (q === '' || !q) {
      dispatch(setPage(1));
      dispatch(setQuery(''));
      dispatch(refreshConversation());
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
