import React, { useCallback } from 'react';
import { Edit3, Check, X } from 'lucide-react';
import { useChatBadges, useLocalize } from '~/hooks';
import { Button, Badge } from '~/components/ui';
import type { BadgeItem } from '~/common';

interface EditBadgesProps {
  isEditingChatBadges: boolean;
  handleCancelBadges: () => void;
  handleSaveBadges: () => void;
  setBadges: (badges: Pick<BadgeItem, 'id'>[]) => void;
}

const EditBadgesComponent = ({
  isEditingChatBadges,
  handleCancelBadges,
  handleSaveBadges,
  setBadges,
}: EditBadgesProps) => {
  const localize = useLocalize();
  const allBadges = useChatBadges() || [];
  const unavailableBadges = allBadges.filter((badge) => !badge.isAvailable);

  const handleRestoreBadge = useCallback(
    (badgeId: string) => {
      console.log('Restoring badge:', badgeId);

      const availableBadges = allBadges
        .filter((badge) => badge.isAvailable)
        .map((badge) => ({ id: badge.id }));

      setBadges([...availableBadges, { id: badgeId }]);
    },
    [allBadges, setBadges],
  );

  if (!isEditingChatBadges) {
    return null;
  }

  return (
    <div className="m-1.5 flex flex-col overflow-hidden rounded-b-lg rounded-t-2xl bg-surface-secondary-alt">
      <div className="flex items-center gap-4 py-2 pl-3 pr-1.5 text-sm">
        <span className="mt-0 flex size-6 flex-shrink-0 items-center justify-center">
          <div className="icon-md">
            <Edit3 className="icon-md" aria-hidden="true" />
          </div>
        </span>
        <span className="text-token-text-secondary line-clamp-3 flex-1 py-0.5 font-semibold">
          {localize('com_ui_save_badge_changes')}
        </span>
        <div className="flex h-8 gap-2">
          <Button
            size="sm"
            variant="destructive"
            aria-label="Cancel"
            onClick={handleCancelBadges}
            className="h-8"
          >
            <X className="icon-md" aria-hidden="true" />
          </Button>
          <Button
            size="sm"
            variant="submit"
            aria-label="Save changes"
            onClick={handleSaveBadges}
            className="h-8 rounded-b-lg rounded-tr-xl"
          >
            <Check className="icon-md" aria-hidden="true" />
          </Button>
        </div>
      </div>
      {unavailableBadges && unavailableBadges.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 p-2">
          {unavailableBadges.map((badge) => (
            <div key={badge.id} className="app-icon">
              <Badge
                icon={badge.icon}
                label={badge.label}
                isAvailable={false}
                isEditing={true}
                onBadgeAction={() => handleRestoreBadge(badge.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default React.memo(EditBadgesComponent);
