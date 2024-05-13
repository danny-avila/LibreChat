import { TConversation, TUser, request, type TMessage } from 'librechat-data-provider';
import { useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Socket } from 'socket.io-client';
import store from '~/store';

export const useChatCall = (socket?: Socket) => {
  const user = useRecoilValue(store.user);
  const convoType = useRecoilValue(store.convoType);
  const { conversationId } = useParams();
  const [_, setIsSubmitting] = useRecoilState(store.isSubmitting);

  const sendMessage = useCallback(
    async (message: TMessage | TMessage[], bot = false) => {
      setIsSubmitting(true);
      if (!socket || convoType !== 'r') {
        return null;
      }

      if (!bot) {
        await request.post(`/api/rooms/${conversationId}`, message);
      }

      socket.emit('new message', {
        userId: user?.id,
        roomId: conversationId,
        message: message,
        bot,
      });
      setIsSubmitting(false);
    },
    [socket, user, conversationId, convoType, setIsSubmitting],
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

  const joinRoom = useCallback(
    async (user: TUser, room: TConversation) => {
      if (!socket || convoType !== 'r') {
        return null;
      }

      console.log('--- join room event emitter ---', user, room.conversationId);

      socket.emit('join room', {
        user,
        roomId: room.conversationId,
      });
    },
    [socket, convoType],
  );

  const sendBotMessage = useCallback(
    async (message: TMessage | TMessage[], botType: 'karma-bot' | 'tip-bot') => {
      if (!socket || convoType !== 'r') {
        return null;
      }

      socket.emit('send bot message', {
        userId: user?.id,
        roomId: conversationId,
        message: message,
      });
    },
    [socket, user, conversationId, convoType],
  );

  return { socket, sendMessage, updateMessage, joinRoom, sendBotMessage };
};
