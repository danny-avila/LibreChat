import { request, type TMessage } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Socket } from 'socket.io-client';
import store from '~/store';
import { useScrollToID } from './useScrollToRef';

export const useChatCall = (socket?: Socket) => {
  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);
  const { conversationId } = useParams();
  const { scrollToId } = useScrollToID({ id: 'here' });
  const [_, setIsSubmitting] = useRecoilState(store.isSubmitting);

  const sendMessage = useCallback(
    async (message: TMessage | TMessage[], bot = false) => {
      setIsSubmitting(true);
      if (!socket || convoType !== 'r') {
        return null;
      }

      console.log(message);

      if (!bot) {
        await request.post(`/api/rooms/${conversationId}`, message);
      }

      scrollToId();
      socket.emit('new message', {
        userId: user?.id,
        roomId: conversationId,
        message: message,
        bot,
      });
      setIsSubmitting(false);
    },
    [socket, user, conversationId, convoType, scrollToId, setIsSubmitting],
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
