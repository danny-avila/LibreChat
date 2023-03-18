import React, { useState, useCallback } from 'react';
import { debounce } from 'lodash';
import { useDispatch } from 'react-redux';
import { Search } from 'lucide-react';
import { setQuery } from '~/store/searchSlice';
import { setConvos, refreshConversation } from '~/store/convoSlice';
import axios from 'axios';

const fetch = async (q, pageNumber, callback) => {
  const { data } = await axios.get(`/api/search?q=${q}&pageNumber=${pageNumber}`);
  console.log(data);
  callback(data);
};

export default function SearchBar({ onSuccess, clearSearch }) {
  const dispatch = useDispatch();
  const [inputValue, setInputValue] = useState('');

  // const onSuccess = (data) => {
  //   const { conversations, pages, pageNumber } = data;
  //   dispatch(setConvos({ convos: conversations, searchFetch: true }));
  //   dispatch(setPage(pageNumber));
  //   dispatch(setPages(pages));
  // };

  const debouncedChangeHandler = useCallback(
    debounce((q) => {
      dispatch(setQuery(q));
      if (q.length > 0) {
        fetch(q, 1, onSuccess);
      }
    }, 750),
    [dispatch]
  );

  const handleKeyUp = (e) => {
    const { value } = e.target;
    if (e.keyCode === 8 && value === '') { 
      // Value after clearing input: ""
      console.log(`Value after clearing input: "${value}"`);
      dispatch(setQuery(''));
      clearSearch();
     }
  };


  const changeHandler = (e) => {
    // if (!search) {
    //   console.log('setting page to 1');
    //   dispatch(setPage(1));
    // }

    let q = e.target.value;
    setInputValue(q);
    q = q.trim();

    if (q === '') {
      dispatch(setQuery(''));
      // dispatch(setPage(1));
      // dispatch(refreshConversation());
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
