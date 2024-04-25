import { request, type TMessage } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Socket } from 'socket.io-client';
import store from '~/store';

export const useChatCall = (socket?: Socket) => {
  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);
  const { conversationId } = useParams();

  const sendMessage = useCallback(
    async (message: TMessage | TMessage[], bot?: boolean) => {
      if (!socket || convoType !== 'r') {
        return null;
      }

      if (!bot) {
        await request.post(`/api/rooms/${conversationId}`, message);
      }

      console.log('new message');

      socket.emit('new message', {
        userId: user?.id,
        roomId: conversationId,
        message: message,
        bot,
      });
    },
    [socket, user, conversationId, convoType],
  );

  const updateMessage = useCallback(
    async (message: TMessage | TMessage[]) => {
      if (!socket || convoType !== 'r') {
        return null;
      }

      socket.emit('update message', {
        userId: user?.id,
        roomId: conversationId,
        message: message,
      });
    },
    [socket, user, conversationId, convoType],
  );

  return { socket, sendMessage, updateMessage };
};
