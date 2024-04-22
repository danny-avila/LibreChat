import React from 'react';
import { useChatContext } from '~/Providers';
import User from './User';
import { TUser } from 'librechat-data-provider';
import { useRecoilValue } from 'recoil';
import store from '~/store';

export default function Users({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const { conversation } = useChatContext();
  // const conversation = useRecoilValue(store.conversation);
  console.log('--- users', conversation);

  return (
    <>
      <div
        style={{
          color: '#aaa',
          fontSize: '0.7rem',
          marginTop: '20px',
          marginBottom: '5px',
          paddingLeft: isCollapsed ? '5px' : '10px',
        }}
      >
        {isCollapsed ? 'Admin' : 'Administrator'}
      </div>
      {conversation?.user && typeof conversation.user !== 'string'}
      <User user={conversation?.user as unknown as TUser} isCollapsed={isCollapsed} />
      <div
        style={{
          color: '#aaa',
          fontSize: '0.7rem',
          marginTop: '20px',
          marginBottom: '5px',
          paddingLeft: isCollapsed ? '5px' : '10px',
        }}
      >
        Users
      </div>
      {conversation &&
        conversation.users &&
        conversation.users
          .filter((u) => u !== undefined && typeof u !== 'string')
          .map((u) => (
            <User key={`user-${u._id || ''}`} user={u as TUser} isCollapsed={isCollapsed} />
          ))}
    </>
  );
}
