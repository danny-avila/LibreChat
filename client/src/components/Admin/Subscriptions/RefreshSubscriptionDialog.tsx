/* eslint-disable i18next/no-literal-string */
import { useEffect, useState } from 'react';
import { useToastContext } from '@librechat/client';
import { NotificationSeverity } from '~/common';
import { useRefreshSubscriptionMutation } from '~/data-provider/Admin';
import { useAdminMutation } from '~/hooks/useFreshAuth';
import AdminActionDialog from './AdminActionDialog';
import { friendlyErrorMessage, getServerError } from './dialogUtils';

type RefreshSubscriptionDialogProps = {
  userId: string;
  userEmail?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export default function RefreshSubscriptionDialog({
  userId,
  userEmail,
  open,
  onOpenChange,
}: RefreshSubscriptionDialogProps) {
  const { showToast } = useToastContext();
  const mutation = useRefreshSubscriptionMutation();
  const runMutation = useAdminMutation(mutation);
  const [serverError, setServerError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setServerError(null);
  }, [open, userId]);

  const handleConfirm = async () => {
    setServerError(null);
    try {
      await runMutation({ userId });
      showToast({ message: 'Subscription refreshed.' });
      onOpenChange(false);
    } catch (err) {
      const { code } = getServerError(err);
      const friendly = friendlyErrorMessage(err);
      if (code === 'USER_NOT_FOUND' || code === 'NO_SUBSCRIPTION') {
        setServerError(friendly);
        return;
      }
      setServerError(friendly);
      showToast({ message: friendly, severity: NotificationSeverity.ERROR });
    }
  };

  const isPending = mutation.isLoading;

  return (
    <AdminActionDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isPending) return;
        onOpenChange(next);
      }}
      title="Refresh subscription"
      description={
        <span>
          {userEmail ? `For ${userEmail}. ` : null}
          This calls RevenueCat which may take a couple seconds.
        </span>
      }
      footer={
        <>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-transparent px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={isPending}
            className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-100"
          >
            {isPending ? 'Refreshing…' : 'Refresh now'}
          </button>
        </>
      }
    >
      {serverError ? (
        <div className="text-sm text-red-500" role="alert">
          {serverError}
        </div>
      ) : null}
    </AdminActionDialog>
  );
}
