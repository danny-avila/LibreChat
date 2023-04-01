import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

import Landing from '../components/ui/Landing';
import Messages from '../components/Messages';
import TextChat from '../components/Input';

import store from '~/store';
import { useGetMessagesByConvoId, useGetConversationByIdQuery } from '~/data-provider';

export default function Chat() {
  const searchQuery = useRecoilValue(store.searchQuery);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const setMessages = useSetRecoilState(store.messages);
  const messagesTree = useRecoilValue(store.messagesTree);
  const { newConversation } = store.useConversation();
  const { route } = useParams();
  const navigate = useNavigate();

  // TODO: Shouldn't be setting conversation ids that aren't actually conversation id's, then we don't have to do this check
  const messagesQuery = useGetMessagesByConvoId(conversation?.conversationId, {enabled: !!conversation?.conversationId && conversation?.conversationId !== 'search' && conversation?.conversationId !== 'new' });
  const conversationQuery = useGetConversationByIdQuery(route, { enabled: !!route && route !== 'search' && route !== 'new'});

  // need to get conversationId from url for the query when it is not new or search because 
  // the query gets called infinitely with "new" as the id. 
  // every time setConversation is called anywhere in the app it triggers a change to the conversationId
  // which triggers a refetch of the query with the new conversationId, including when it is not an actual conversationId
  // useEffect(() => {
  //   if (route !== 'new' && route !== 'search') {
  //     setConversationId(route);
  //   }
  // }, [route, setConversationId]);
    
  // when conversation changed or conversationId (in url) changed
  useEffect(() => {
    if (conversation === null) {
      // no current conversation, we need to do something
      if (route === 'new') {
        // create new
       // newConversation();
      } else if (conversationQuery.data) {
        // fetch it from server
       // setConversation(conversationQuery.data);
       // setMessages(null);
      } else if (conversationQuery.isError) {
        console.error('failed to fetch the conversation');
        console.error(conversationQuery.error);
       // newConversation();
      } else {
        navigate(`/chat/new`);
      }
    } else if (conversation?.conversationId === 'search') {
      // jump to search page
      navigate(`/search/${searchQuery}`);
    } else if (conversation?.conversationId !== route) {
      // conversationId (in url) should always follow conversation?.conversationId, unless conversation is null
      navigate(`/chat/${conversation?.conversationId}`);
    }
  }, [conversation, route, newConversation, navigate, searchQuery, setMessages, conversationQuery]);

  // when messagesTree is null (<=> messages is null)
  // we need to fetch message list from server
  // useEffect(() => {
  //   if (messagesTree === null) {
  //     messagesQuery.refetch(conversation?.conversationId);
  //   }
  // }, [conversation?.conversationId, messagesQuery, messagesTree]);

  // if not a conversation
  if (conversation?.conversationId === 'search') return null;
  // if conversationId not match
  if (conversation?.conversationId !== route) return null;
  // if conversationId is null
  if (!route) return null;

  return (
    <>
      {route === 'new' && !messagesTree?.length ? <Landing /> : <Messages />}
      <TextChat />
    </>
  );
}
