import { useEffect, useState } from 'react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Socket, io } from 'socket.io-client';
import store from '~/store';
import useChatHelpers from './useChatHelpers';
import { useParams } from 'react-router-dom';
import { request, type TMessage } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';
import useSound from 'use-sound';
import tipSFX from '../../public/assets/mp3/tipSFX.mp3';

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

  const index = 0;
  const { conversationId } = useParams();
  const chatHelpers = useChatHelpers(0, conversationId, socket);
  const { conversation, setConversation } = chatHelpers;
  const { showToast } = useToastContext();

  const convoType = useRecoilValue(store.convoType);

  const { getMessages, setMessages, setLatestMessage } = useChatHelpers(index, conversationId);

  useEffect(() => {
    socket?.on('new message', (data) => {
      console.log(data);
      if (conversationId === data.roomId) {
        const currentMessages: TMessage[] | null = getMessages() ?? [];
        if (data.replace) {
          currentMessages.pop();
        }
        console.log(currentMessages);
        setMessages([...currentMessages, { _id: '111111', ...data.message }]);
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

    socket?.on('join room', (data) => {
      console.log('--- join room event ---', conversation, conversationId, data);
      if (conversationId === data.roomId) {
        // eslint-disable-next-line no-unsafe-optional-chaining
        setConversation({ ...conversation, users: [...conversation?.users, data.user] });
        showToast({ message: `@${data.user.username} joined the room` });
      }
    });

    return () => {
      socket?.off('new message');
      socket?.off('update message');
      socket?.off('ai response message');
      socket?.off('join room');
    };
  }, [
    socket,
    setLatestMessage,
    setMessages,
    setIsSubmitting,
    getMessages,
    conversationId,
    setConversation,
    conversation,
  ]);

  useEffect(() => {
    if (convoType === 'r' && conversationId !== 'new' && conversationId) {
      socket?.emit('move room', { roomId: conversationId });
    }
  }, [conversationId, convoType, socket]);

  return { socket };
};
//
export const usePushSocket = (socket?: Socket) =>
{
  const user = useRecoilValue(store.user);
  const [play] = useSound(tipSFX);
  const { showToast } = useToastContext();
  //
  useEffect(() => {
    socket?.on('tipNotification', (data) => {
        const { recipient, network, sender, anonymous } = data;
        console.log(data)
        if(user?.id == recipient){
          const isMuted = localStorage.getItem('NotificationDisplay') || 'false';
          if(isMuted=='false'){
            play()
          }
          if(!anonymous){
            showToast({ message: `Congratulations! Tip received from ${sender} on the ${network} network` , status: 'success' });
          }else {
            showToast({ message: `Congratulations! Tip received from Anonymous on the ${network} network` , status: 'success' });
          }

        }
    });
    //
    return () => {
      socket?.off('tipNotification');
    };
  }, [ socket ]);
  //
  return { socket };
};
