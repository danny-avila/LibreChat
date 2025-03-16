import React from 'react';
import { cn } from '~/utils';
import { ModelItemProps } from '~/common';

const ModelItem: React.FC<ModelItemProps> = ({
  modelName,
  endpoint,
  isSelected,
  onSelect,
  onNavigateBack,
  icon,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onNavigateBack();
    }
  };

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      role="menuitem"
      tabIndex={0}
      aria-current={isSelected ? 'true' : undefined}
      className={cn(
        'flex w-full cursor-pointer items-center justify-start rounded-md px-3 py-2 text-sm text-text-primary hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
        isSelected ? 'bg-surface-tertiary' : '',
      )}
    >
      {icon && (
        <div
          className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden rounded-full"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      {modelName}
    </div>
  );
};

export default React.memo(ModelItem);
