import React, { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';

import Messages from '~/components/Messages';
import TextChat from '~/components/Input/TextChat';

import store from '~/store';

export default function Search() {
  const [searchQuery, setSearchQuery] = useRecoilState(store.searchQuery);
  const conversation = useRecoilValue(store.conversation);
  const { searchPlaceholderConversation } = store.useConversation();
  const { query } = useParams();
  const navigate = useNavigate();

  // when conversation changed or conversationId (in url) changed
  useEffect(() => {
    if (conversation === null) {
      // no current conversation, we need to do something
      if (query) {
        // create new
        searchPlaceholderConversation();
        setSearchQuery(query);
      } else {
        navigate('/chat/new');
      }
    } else if (conversation?.conversationId === 'search') {
      // jump to search page
      if (searchQuery !== query) {
        navigate(`/search/${searchQuery}`);
      }
    } else {
      // conversationId (in url) should always follow conversation?.conversationId, unless conversation is null
      navigate(`/chat/${conversation?.conversationId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation, query, searchQuery]);

  // if not a search
  if (conversation?.conversationId !== 'search') {
    return null;
  }
  // if query not match
  if (searchQuery !== query) {
    return null;
  }
  // if query is null
  if (!query) {
    return null;
  }

  return (
    <>
      <Messages isSearchView={true} />
      <TextChat isSearchView={true} />
    </>
  );
}
