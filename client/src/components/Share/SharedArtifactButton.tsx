import React from 'react';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface SharedArtifactButtonProps {
  onClick: () => void;
  isOpen: boolean;
}

const SharedArtifactButton: React.FC<SharedArtifactButtonProps> = ({ onClick, isOpen }) => {
  const localize = useLocalize();

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "fixed right-4 top-4 z-50 rounded-md bg-surface-primary p-2 text-text-primary shadow-lg hover:bg-surface-secondary",
        isOpen && "bg-surface-secondary"
      )}
      aria-label={localize('com_ui_toggle_artifacts')}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="h-6 w-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    </button>
  );
};

export default SharedArtifactButton;