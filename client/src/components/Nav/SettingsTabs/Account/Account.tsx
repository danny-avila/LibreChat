import React from 'react';
import ChangePassword from './ChangePassword';
import DeleteAccount from './DeleteAccount';
import SubscriptionSection from './SubscriptionSection';
import { useAuthContext } from '~/hooks';

function Account() {
  const { user } = useAuthContext();

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <div className="pb-3">
        <SubscriptionSection />
      </div>
      {user?.provider === 'local' && (
        <div className="pb-3">
          <ChangePassword />
        </div>
      )}
      <div className="pb-3">
        <DeleteAccount />
      </div>
    </div>
  );
}

export default React.memo(Account);
