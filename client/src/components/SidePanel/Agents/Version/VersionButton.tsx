import { History } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

interface VersionButtonProps {
  setActivePanel: (panel: Panel) => void;
}

const VersionButton = ({ setActivePanel }: VersionButtonProps) => {
  const localize = useLocalize();

  return (
    <button
      type="button"
      onClick={() => setActivePanel(Panel.version)}
      aria-label={localize('com_ui_agent_version')}
      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-border-light bg-transparent px-3 text-sm font-medium text-text-primary transition-colors hover:bg-surface-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
    >
      <History className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      {localize('com_ui_agent_version')}
    </button>
  );
};

export default VersionButton;
