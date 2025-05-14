import { ChevronLeft } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import type { TAgentsEndpoint } from 'librechat-data-provider';
import type { AgentForm } from '~/common/agents-types';
import type { AgentPanelProps } from '~/common';
import { useLocalize } from '~/hooks';
import { Panel } from '~/common';

type VersionPanelProps = {
  agentsConfig: TAgentsEndpoint | null;
  setActivePanel: AgentPanelProps['setActivePanel'];
};

export default function VersionPanel({ agentsConfig, setActivePanel }: VersionPanelProps) {
  const localize = useLocalize();
  const methods = useFormContext<AgentForm>();

  return (
    <div className="scrollbar-gutter-stable h-full min-h-[40vh] overflow-auto pb-12 text-sm">
      <div className="version-panel relative flex flex-col items-center px-16 py-4 text-center">
        <div className="absolute left-0 top-4">
          <button
            type="button"
            className="btn btn-neutral relative"
            onClick={() => {
              setActivePanel(Panel.builder);
            }}
          >
            <div className="version-panel-content flex w-full items-center justify-center gap-2">
              <ChevronLeft />
            </div>
          </button>
        </div>
        <div className="mb-2 mt-2 text-xl font-medium">
          {/* localize('com_ui_version_settings') */}
        </div>
      </div>
      <div className="flex flex-col gap-4 px-2"></div>
    </div>
  );
}
