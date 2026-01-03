import { useState, useMemo } from 'react';
import { X, UserPlus, Users } from 'lucide-react';
import { PrincipalType } from 'librechat-data-provider';
import type { TPrincipal } from 'librechat-data-provider';
import {
  useGetConversationSharesQuery,
  useShareConversationWithUsersMutation,
  useRevokeConversationShareMutation,
} from 'librechat-data-provider/react-query';
import { Button, Spinner, useToastContext } from '@librechat/client';
import UnifiedPeopleSearch from '~/components/Sharing/PeoplePicker/UnifiedPeopleSearch';
import { NotificationSeverity } from '~/common';
import { useLocalize } from '~/hooks';

interface ShareWithUsersButtonProps {
  conversationId: string;
}

export default function ShareWithUsersButton({ conversationId }: ShareWithUsersButtonProps) {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const [showUserSearch, setShowUserSearch] = useState(false);

  const { data: sharesData, isLoading: isLoadingShares } = useGetConversationSharesQuery(
    conversationId,
    {
      enabled: !!conversationId,
    },
  );

  const { mutateAsync: shareWithUsers, isLoading: isSharing } =
    useShareConversationWithUsersMutation();

  const { mutateAsync: revokeShare, isLoading: isRevoking } = useRevokeConversationShareMutation();

  const sharedWithUsers = useMemo(() => sharesData?.sharedWith || [], [sharesData?.sharedWith]);

  const excludeUserIds = useMemo(
    () => sharedWithUsers.map((user) => user.id),
    [sharedWithUsers],
  );

  const handleAddUsers = async (principals: TPrincipal[]) => {
    const userIds = principals
      .filter((p) => p.idOnTheSource)
      .map((p) => p.idOnTheSource as string);

    if (userIds.length === 0) {
      return;
    }

    try {
      await shareWithUsers({ conversationId, userIds });
      showToast({
        message: localize('com_ui_shared_with_users_success'),
        severity: NotificationSeverity.SUCCESS,
      });
      setShowUserSearch(false);
    } catch (error) {
      showToast({
        message: localize('com_ui_share_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  };

  const handleRevokeAccess = async (userId: string) => {
    try {
      await revokeShare({ conversationId, userIds: [userId] });
      showToast({
        message: localize('com_ui_revoked_share_success'),
        severity: NotificationSeverity.SUCCESS,
      });
    } catch (error) {
      showToast({
        message: localize('com_ui_share_error'),
        severity: NotificationSeverity.ERROR,
      });
    }
  };

  return (
    <div className="mt-4 border-t border-border-light pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-text-secondary" />
          <span className="text-sm font-medium text-text-primary">
            {localize('com_ui_share_with_team')}
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowUserSearch(!showUserSearch)}
          disabled={isSharing}
        >
          <UserPlus className="mr-1 size-4" />
          {localize('com_ui_add_people')}
        </Button>
      </div>

      {showUserSearch && (
        <div className="mb-4">
          <UnifiedPeopleSearch
            onAddPeople={handleAddUsers}
            placeholder={localize('com_ui_search_users')}
            typeFilter={[PrincipalType.USER]}
            excludeIds={excludeUserIds}
            className="w-full"
          />
        </div>
      )}

      {isLoadingShares ? (
        <div className="flex justify-center py-2">
          <Spinner className="size-5" />
        </div>
      ) : sharedWithUsers.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-text-secondary">
            {localize('com_ui_shared_with_count', { count: sharedWithUsers.length })}
          </p>
          <ul className="max-h-32 space-y-1 overflow-y-auto">
            {sharedWithUsers.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between rounded-md bg-surface-secondary px-2 py-1.5"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-text-primary">
                    {user.name || user.email}
                  </span>
                  {user.name && user.email && (
                    <span className="text-xs text-text-secondary">{user.email}</span>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRevokeAccess(user.id)}
                  disabled={isRevoking}
                  aria-label={localize('com_ui_remove_access')}
                  className="size-6 p-0 hover:bg-surface-hover"
                >
                  <X className="size-4 text-text-secondary" />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">{localize('com_ui_not_shared_with_anyone')}</p>
      )}
    </div>
  );
}
