import React from 'react';
import DisplayUsernameMessages from './DisplayUsernameMessages';
import DeleteAccount from './DeleteAccount';
import Avatar from './Avatar';
import PassKeys from './PassKeys';

function Account() {
  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <Avatar />
      </div>
      <div className="pb-3">
        <DeleteAccount />
      </div>
      <div className="pb-3">
        <DisplayUsernameMessages />
      </div>
      <div className="pb-3">
        <PassKeys />
      </div>
    </div>
  );
}

export default React.memo(Account);
