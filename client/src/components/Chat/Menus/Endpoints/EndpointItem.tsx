import React from 'react';
import { Settings, ChevronRight } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';

interface EndpointItemProps {
  endpoint: EModelEndpoint;
  label: string;
  icon: JSX.Element | null;
  hasModels: boolean;
  isSelected: boolean;
  requiresUserKey: boolean;
  onSelect: () => void;
  onOpenKeyDialog: (ep: EModelEndpoint, e: React.MouseEvent | React.KeyboardEvent) => void;
  onOpenDropdown: (endpoint: string) => void;
}

const EndpointItem: React.FC<EndpointItemProps> = ({
  endpoint,
  label,
  icon,
  hasModels,
  isSelected,
  requiresUserKey,
  onSelect,
  onOpenKeyDialog,
  onOpenDropdown,
}) => {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect();
    } else if (e.key === 'ArrowRight' && hasModels) {
      e.preventDefault();
      onOpenDropdown(endpoint);
    }
  };

  return (
    <div
      onClick={onSelect}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="menuitem"
      aria-haspopup={hasModels ? 'true' : undefined}
      aria-expanded={isSelected && hasModels ? true : undefined}
      className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-2 text-sm text-text-primary transition-colors duration-75 hover:bg-surface-tertiary focus:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <div className="flex items-center">
        {icon && (
          <div
            className="mr-2 flex h-5 w-5 items-center justify-center overflow-hidden text-text-primary"
            aria-hidden="true"
          >
            {icon}
          </div>
        )}
        <span className="truncate text-left">{label}</span>
      </div>
      <div className="flex items-center">
        {requiresUserKey && (
          <button
            onClick={(e) => onOpenKeyDialog(endpoint, e)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onOpenKeyDialog(endpoint, e);
              }
              e.stopPropagation();
            }}
            className="mr-2 rounded p-1 hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            aria-label={`Configure key for ${label}`}
          >
            <Settings className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          </button>
        )}
        {hasModels && <ChevronRight className="h-4 w-4 text-text-secondary" aria-hidden="true" />}
      </div>
    </div>
  );
};

export default React.memo(EndpointItem);
