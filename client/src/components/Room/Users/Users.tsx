import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useChatContext, useToastContext } from '~/Providers';
import User from './User';
import { TUser } from 'librechat-data-provider';

export default function Users({ isCollapsed = false }: { isCollapsed?: boolean }) {
  const { conversation } = useChatContext();
  const navigate = useNavigate();
  const { showToast } = useToastContext();

  if (!conversation?.user) {
    showToast({ message: 'This room has been closed.', status: 'warning' });
    return navigate('/r/new');
  }

  return (
    <>
      <p className="w-full pt-3 text-center font-bold text-gray-800 dark:text-gray-100">
        {conversation?.users
          ? conversation.users.length > 0
            ? `${conversation.users.length + 1} ${isCollapsed ? '' : 'Participants'}`
            : `1 ${isCollapsed ? '' : 'Participant'}`
          : `1 ${isCollapsed ? '' : 'Participant'}`}
      </p>
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
            <User key={`user-${u?._id || ''}`} user={u as TUser} isCollapsed={isCollapsed} />
          ))}
    </>
  );
}
