import { TUser, request } from 'librechat-data-provider';
import { useCallback, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import { Socket } from 'socket.io-client';
import store from '~/store';

export default function useRoomUsers(conversationId, socket?: Socket) {
  const [users, setUsers] = useRecoilState(store.usersInRoom);

  const getUsersByRoom = useCallback(() => {
    request
      .get(`/api/rooms/${conversationId}/users`)
      .then((res) => setUsers(res as TUser[]))
      .catch((error) => console.error(error));
  }, [conversationId, setUsers]);

  useEffect(() => {
    getUsersByRoom();
  }, [conversationId, getUsersByRoom]);

  // useEffect(() => {
  //   if (socket) {
  //     socket.on('')
  //   }
  // }, [socket])
}
