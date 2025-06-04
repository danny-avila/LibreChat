import React from 'react';
import { TooltipAnchor } from '~/components/ui';
import { PhoneIcon } from '~/components/svg';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface PhoneButtonProps {
  disabled?: boolean;
  onClick?: () => void;
}

const PhoneButton: React.FC<PhoneButtonProps> = ({ disabled = false, onClick }) => {
  const localize = useLocalize();

  return (
    <TooltipAnchor
      description="Llamar"
      render={
        <button
          type="button"
          aria-label="Llamar"
          disabled={disabled}
          onClick={onClick}
          className={cn(
            'cursor-pointer flex size-9 items-center justify-center rounded-full p-1 transition-colors hover:bg-surface-hover focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50',
            disabled && 'cursor-not-allowed opacity-50'
          )}
        >
          <PhoneIcon size={24} />
        </button>
      }
    />
  );
};

export default PhoneButton; 