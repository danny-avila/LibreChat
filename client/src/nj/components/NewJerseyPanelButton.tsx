import React from 'react';
import { ChevronRight } from 'lucide-react';

export default function NewJerseyPanelButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between bg-surface-tertiary px-3 py-4 text-left hover:bg-[#E6E6E2]"
    >
      <span className="text-token-text-primary text-sm font-semibold">{label}</span>
      <ChevronRight className="text-token-text-primary h-4 w-4" aria-hidden />
    </button>
  );
}
