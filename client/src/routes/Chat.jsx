import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

import Landing from '../components/ui/Landing';
import Messages from '../components/Messages';
import TextChat from '../components/Input';

import store from '~/store';
import {
  useGetMessagesByConvoId,
  useGetConversationByIdMutation,
  useGetStartupConfig
} from '~/data-provider';

export default function Chat() {
  const [shouldNavigate, setShouldNavigate] = useState(true);
  const searchQuery = useRecoilValue(store.searchQuery);
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const setMessages = useSetRecoilState(store.messages);
  const messagesTree = useRecoilValue(store.messagesTree);
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const { newConversation } = store.useConversation();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  //disabled by default, we only enable it when messagesTree is null
  const messagesQuery = useGetMessagesByConvoId(conversationId, { enabled: false });
  const getConversationMutation = useGetConversationByIdMutation(conversationId);
  const { data: config } = useGetStartupConfig();

  useEffect(() => {
    if (!isSubmitting && !shouldNavigate) {
      setShouldNavigate(true);
    }
  }, [shouldNavigate, isSubmitting]);

  // when conversation changed or conversationId (in url) changed
  useEffect(() => {
    // No current conversation and conversationId is 'new'
    if (conversation === null && conversationId === 'new') {
      newConversation();
      setShouldNavigate(true);
    } 
    // No current conversation and conversationId exists
    else if (conversation === null && conversationId) {
      getConversationMutation.mutate(conversationId, {
        onSuccess: (data) => {
          console.log('Conversation fetched successfully');
          setConversation(data);
          setShouldNavigate(true);
        },
        onError: (error) => {
          console.error('Failed to fetch the conversation');
          console.error(error);
          navigate(`/chat/new`);
          newConversation();
          setShouldNavigate(true);
        }
      });
      setMessages(null);
    } 
    // No current conversation and no conversationId
    else if (conversation === null) {
      navigate(`/chat/new`);
      setShouldNavigate(true);
    } 
    // Current conversationId is 'search'
    else if (conversation?.conversationId === 'search') {
      navigate(`/search/${searchQuery}`);
      setShouldNavigate(true);
    } 
    // Conversation change and isSubmitting 
    else if (conversation?.conversationId !== conversationId && isSubmitting) {
      setShouldNavigate(false);
    }
    // conversationId (in url) should always follow conversation?.conversationId, unless conversation is null
    else if (conversation?.conversationId !== conversationId) {
      if (shouldNavigate) {
        navigate(`/chat/${conversation?.conversationId}`);
      } else {
        setShouldNavigate(true);
      }
    }
    document.title = conversation?.title || config?.appTitle || 'Chat';
  }, [conversation, conversationId, config]);

  useEffect(() => {
    if (messagesTree === null && conversation?.conversationId) {
      messagesQuery.refetch(conversation?.conversationId);
    }
  }, [conversation?.conversationId, messagesQuery, messagesTree]);

  useEffect(() => {
    if (messagesQuery.data) {
      setMessages(messagesQuery.data);
    } else if (messagesQuery.isError) {
      console.error('failed to fetch the messages');
      console.error(messagesQuery.error);
      setMessages(null);
    }
  }, [messagesQuery.data, messagesQuery.isError, setMessages]);

  // if not a conversation
  if (conversation?.conversationId === 'search') return null;
  // if conversationId not match
  if (conversation?.conversationId !== conversationId && !conversation) return null;
  // if conversationId is null
  if (!conversationId) return null;

  if (conversationId && !messagesTree) {
    return (
      <>
        <Messages />
        <TextChat />
      </>
    )
  }

  return (
    <>
      {conversationId === 'new' && !messagesTree?.length ? <Landing /> : <Messages />}
      <TextChat />
    </>
  );
}
