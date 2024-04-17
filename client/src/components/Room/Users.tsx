import React from 'react';
import { useChatContext } from '~/Providers';
import User from './User';
import { useRecoilValue } from 'recoil';
import store from '~/store';
import { TUser } from 'librechat-data-provider';

export default function Users() {
  const { conversation } = useChatContext();
  const user = useRecoilValue(store.user);

  return (
    <div className="p-3">
      <User user={user as TUser} />
    </div>
  );
}
