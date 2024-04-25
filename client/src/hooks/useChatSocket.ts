import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Socket, io } from 'socket.io-client';
import store from '~/store';
import useChatHelpers from './useChatHelpers';
import { useParams } from 'react-router-dom';
import { type TMessage } from 'librechat-data-provider';

export const useInitSocket = () => {
  const user = useRecoilValue(store.user);
  const [socket, setSocket] = useState<Socket>();

  useEffect(() => {
    // console.log('domain server', process.env.DOMAIN_SERVER);
    if (user) {
      const newSocket = io('http://localhost:3090', {
        query: { userId: user.id },
      });
      setSocket(newSocket);
    }
    return () => {
      socket?.disconnect();
    };
  }, [user?.id]);

  return socket;
};

export const useChatSocket = (socket?: Socket) => {
  const [_, setIsSubmitting] = useRecoilState(store.isSubmitting);

  const index = 0;
  const { conversationId } = useParams();

  const convoType = useRecoilValue(store.convoType);

  const { getMessages, setMessages, setLatestMessage } = useChatHelpers(index, conversationId);

  useEffect(() => {
    socket?.on('new message', (data) => {
      console.log('--- new message ---', data);
      if (conversationId === data.roomId) {
        setIsSubmitting(true);
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        if (data.replace) {
          currentMessages.pop();
        }
        setMessages([...currentMessages, data.message]);
        setLatestMessage(data.message);
        setIsSubmitting(false);
      }
    });

    socket?.on('update message', (data) => {
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        const index = currentMessages.map((i) => i.messageId).indexOf(data.messageId);
        currentMessages[index] = data.message;
        setMessages(currentMessages);
      }
    });

    return () => {
      socket?.off('new message');
      socket?.off('update message');
    };
  }, [socket, setLatestMessage, setMessages, setIsSubmitting, getMessages, conversationId]);

  useEffect(() => {
    if (convoType === 'r' && conversationId !== 'new' && conversationId) {
      socket?.emit('move room', { roomId: conversationId });
    }
  }, [conversationId, convoType, socket]);

  return { socket };
};
