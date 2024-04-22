import { useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { Socket, io } from 'socket.io-client';
import store from '~/store';
import useChatHelpers from './useChatHelpers';
import { useParams } from 'react-router-dom';
import { type TMessage } from 'librechat-data-provider';

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

  const convoType = useRecoilValue(store.convoType);

  const { getMessages, setMessages, setLatestMessage } = useChatHelpers(index, conversationId);

  useEffect(() => {
    socket?.on('new message', (data) => {
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        if (data.replace) {
          currentMessages.pop();
        }
        setMessages([...currentMessages, data.message]);
        setLatestMessage(data.message);
      }
    });

    socket?.on('update message', (data) => {
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        const index = currentMessages.map((i) => i.messageId).indexOf(data.messageId);
        currentMessages[index] = data.message;
        console.log(currentMessages);
        setMessages(currentMessages);
      }
    });

    return () => {
      socket?.off('new message');
      socket?.off('update message');
    };
  }, [socket, setLatestMessage, setMessages, getMessages, conversationId]);

  useEffect(() => {
    if (convoType === 'r' && conversationId !== 'new' && conversationId) {
      socket?.emit('move room', { roomId: conversationId });
    }
  }, [conversationId, convoType, socket]);

  // const sendMessage = useCallback(
  //   (message: TMessage) => {
  //     if (message.isCreatedByUser) {
  //       request.post(`/api/rooms/${conversationId}`, message);
  //     }

  //     socket?.emit('message', {
  //       userId: user?.id,
  //       roomId: conversationId,
  //       messageId: message.messageId,
  //     });
  //   },
  //   [socket, user?.id, conversationId],
  // );

  return { socket };
};
