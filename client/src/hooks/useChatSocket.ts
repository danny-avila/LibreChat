import { useCallback, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Socket, io } from 'socket.io-client';
import store from '~/store';
import useChatHelpers from './useChatHelpers';
import { useParams } from 'react-router-dom';
import { request, type TMessage } from 'librechat-data-provider';

export const useInitSocket = () => {
  const user = useRecoilValue(store.user);
  const [socket, setSocket] = useState<Socket>();

  useEffect(() => {
    if (user) {
      const newSocket = io('http://localhost:3080', {
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
  const index = 0;
  const { conversationId } = useParams();

  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);

  const { getMessages, setMessages, setLatestMessage } = useChatHelpers(index, conversationId);

  useEffect(() => {
    socket?.on('new message', (data) => {
      console.log('new message income', data);
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        console.log('=== receiving event ===', currentMessages, data.message);
        setMessages([...currentMessages, data.message]);
        setLatestMessage(data.message);
      }
    });

    return () => {
      socket?.off('new message');
    };
  }, [socket, setLatestMessage, setMessages, getMessages, conversationId]);

  useEffect(() => {
    if (convoType === 'r' && conversationId !== 'new' && conversationId) {
      socket?.emit('move room', { roomId: conversationId });
    }
  }, [conversationId, convoType, socket]);

  const sendMessage = useCallback(
    (message: TMessage) => {
      console.log('sending message', message);
      if (message.isCreatedByUser) {
        request.post(`/api/rooms/${conversationId}`, message);
      }

      socket?.emit('message', {
        userId: user?.id,
        roomId: conversationId,
        messageId: message.messageId,
      });
    },
    [socket, user?.id, conversationId],
  );

  return { socket, sendMessage };
};
