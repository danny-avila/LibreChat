import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Socket, io } from 'socket.io-client';
import store from '~/store';
import useChatHelpers from './useChatHelpers';
import { useParams } from 'react-router-dom';
import { request, type TMessage } from 'librechat-data-provider';
import { useScrollToID } from './useScrollToRef';
import { useChatContext } from '~/Providers';

export const useInitSocket = () => {
  const user = useRecoilValue(store.user);
  const [socket, setSocket] = useState<Socket>();

  useEffect(() => {
    if (user) {
      const newSocket = io(import.meta.env.DOMAIN_SERVER || '', {
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
  const { conversation, setConversation } = useChatContext();

  const index = 0;
  const { conversationId } = useParams();

  const convoType = useRecoilValue(store.convoType);

  const { getMessages, setMessages, setLatestMessage } = useChatHelpers(index, conversationId);

  useEffect(() => {
    socket?.on('new message', (data) => {
      console.log('--- new message ---', data);
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        if (data.replace) {
          currentMessages.pop();
        }
        setMessages([...currentMessages, data.message]);
        // setLatestMessage(data.message);
      }
    });

    socket?.on('ai response message', async (data) => {
      if (conversationId === data.roomId) {
        console.log('--- ai response message event ---', data);
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        console.log(currentMessages);
        const messages = await request.get(`/api/messages/${data.messages[0].conversationId}`);
        console.log('AI response message', messages);
        setMessages([
          // ...currentMessages.map((i) => {
          //   if (i.messageId === data.messages[0].fakeMessageId) {
          //     return data.messages[0];
          //   }
          //   return i;
          // }),
          ...(messages as TMessage[]),
        ]);
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

    socket?.on('new user', (data) => {
      if (conversationId === data.roomId) {
        // eslint-disable-next-line no-unsafe-optional-chaining
        setConversation({ ...conversation, users: [...conversation?.users, data.user] });
      }
    });

    return () => {
      socket?.off('new message');
      socket?.off('update message');
      socket?.off('ai response message');
      socket?.off('new user');
    };
  }, [
    socket,
    setLatestMessage,
    setMessages,
    setIsSubmitting,
    getMessages,
    conversationId,
    setConversation,
  ]);

  useEffect(() => {
    if (convoType === 'r' && conversationId !== 'new' && conversationId) {
      socket?.emit('move room', { roomId: conversationId });
    }
  }, [conversationId, convoType, socket]);

  return { socket };
};
