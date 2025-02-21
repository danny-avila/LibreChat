import React from 'react';
import { Edit3, Check, X } from 'lucide-react';
import { Button } from '~/components/ui';
import { useLocalize } from '~/hooks';

interface EditBadgesProps {
  isEditingChatBadges: boolean;
  handleCancelBadges: () => void;
  handleSaveBadges: () => void;
}

const EditBadgesComponent = ({
  isEditingChatBadges,
  handleCancelBadges,
  handleSaveBadges,
}: EditBadgesProps) => {
  const localize = useLocalize();

  if (!isEditingChatBadges) {
    return null;
  }

  return (
    <div className="divide-token-border-light m-1.5 flex flex-col divide-y overflow-hidden rounded-b-lg rounded-t-2xl bg-surface-secondary-alt">
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
    </div>
  );
};

export default React.memo(EditBadgesComponent);
