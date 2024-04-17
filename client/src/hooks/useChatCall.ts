import { request, type TMessage } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Socket } from 'socket.io-client';
import store from '~/store';

export const useChatCall = (socket?: Socket) => {
  const user = useRecoilValue(store.user);
  const { conversationId } = useParams();

  const sendMessage = useCallback(
    async (message: TMessage, bot?: boolean) => {
      if (!socket) {
        return null;
      }

      if (!bot) {
        await request.post(`/api/rooms/${conversationId}`, message);
      }

      socket?.emit('message', {
        userId: user?.id,
        roomId: conversationId,
        messageId: message.messageId,
      });
    },
    [socket, user, conversationId],
  );

  return { socket, sendMessage };
};
