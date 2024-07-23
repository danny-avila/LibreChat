import { TUser, request } from 'librechat-data-provider';
import { useCallback, useEffect } from 'react';
import { useRecoilState } from 'recoil';
import store from '~/store';

export default function useRoomUsers(conversationId) {
  const [_users, setUsers] = useRecoilState(store.usersInRoom);

  const getUsersByRoom = useCallback(() => {
    request
      .get(`/api/rooms/${conversationId}/users`)
      .then((res) => setUsers(res as TUser[]))
      .catch((error) => console.error(error));
  }, [conversationId, setUsers]);

  useEffect(() => {
    getUsersByRoom();
  }, [conversationId, getUsersByRoom]);
}
