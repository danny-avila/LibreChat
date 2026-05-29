import React from 'react';
import { ChevronRight } from 'lucide-react';
import { Panel } from '~/common';

export default function NewJerseyPanelButton({
  label,
  setActivePanel,
}: {
  label: string;
  setActivePanel: (panel: Panel) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => setActivePanel(Panel.advanced)}
      className="flex w-full items-center justify-between bg-surface-tertiary px-3 py-4 text-left hover:bg-[#E6E6E2]"
    >
      <span className="text-token-text-primary text-sm font-semibold">{label}</span>
      <ChevronRight className="text-token-text-primary h-4 w-4" aria-hidden />
    </button>
  );
}
