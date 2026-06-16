import PageHeader from '~/components/ui/PageHeader';
import { useLocalize } from '~/hooks';
import AgentPanelSwitch from '../AgentPanelSwitch';

export default function AgentsView() {
  const localize = useLocalize();
  return (
    <main className="flex h-full min-h-0 flex-col overflow-auto bg-surface-primary text-text-primary">
      <PageHeader title={localize('com_sidepanel_agent_builder')} />
      <div className="flex w-full flex-1 flex-col gap-6 p-6">
        <AgentPanelSwitch noPadding />
      </div>
    </main>
  );
}
