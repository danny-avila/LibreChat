import React, { memo, useCallback } from 'react';
import { useTogglePromptFavorite, useGetUserPromptPreferences } from '~/data-provider';
import { Button, StarIcon } from '~/components';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface FavoriteButtonProps {
  groupId: string;
  size?: string | number;
  onToggle?: (isFavorite: boolean) => void;
}

function FavoriteButton({ groupId, size = '1em', onToggle }: FavoriteButtonProps) {
  const localize = useLocalize();
  const { data: preferences } = useGetUserPromptPreferences();
  const toggleFavorite = useTogglePromptFavorite();

  const isFavorite = preferences?.favorites?.includes(groupId) ?? false;

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleFavorite.mutate(
        { groupId },
        {
          onSuccess: () => {
            onToggle?.(!isFavorite);
          },
        },
      );
    },
    [groupId, isFavorite, onToggle, toggleFavorite],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        handleToggle(e as unknown as React.MouseEvent);
      }
    },
    [handleToggle],
  );

  return (
    <Button
      variant="ghost"
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
      disabled={toggleFavorite.isLoading}
      aria-label={
        isFavorite ? localize('com_ui_remove_from_favorites') : localize('com_ui_add_to_favorites')
      }
      title={
        isFavorite ? localize('com_ui_remove_from_favorites') : localize('com_ui_add_to_favorites')
      }
      className="h-8 w-8 p-0 hover:bg-surface-hover"
    >
      <StarIcon
        size={size}
        filled={isFavorite}
        className={cn(
          'transition-colors duration-200',
          isFavorite
            ? 'text-yellow-500 hover:text-yellow-600'
            : 'text-gray-400 hover:text-yellow-500',
        )}
      />
    </Button>
  );
}

export default memo(FavoriteButton);
