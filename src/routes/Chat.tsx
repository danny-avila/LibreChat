import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

import Landing from '~/components/ui/Landing';
import Messages from '~/components/Messages/Messages';
import TextChat from '~/components/Input/TextChat';

import { useConversation } from '~/hooks';
import store from '~/store';
import { useAuthStore } from '~/zustand';

export default function Chat() {
  const { isAuthenticated } = useAuthStore();
  const [shouldNavigate, setShouldNavigate] = useState(true);
  const messagesTree = useRecoilValue(store.messagesTree);
  const isSubmitting = useRecoilValue(store.isSubmitting);
  const { newConversation } = useConversation();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isAuthenticated()) {
        navigate('/login', { replace: true });
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
    };
  }, [isAuthenticated(), navigate]);

  useEffect(() => {
    if (!isSubmitting && !shouldNavigate) {
      setShouldNavigate(true);
    }
  }, [shouldNavigate, isSubmitting]);

  if (!isAuthenticated()) {
    return null;
  }

  return (
    <>
      {conversationId === 'new' && !messagesTree?.length ? <Landing /> : <Messages />}
      <TextChat />
    </>
  );
}
