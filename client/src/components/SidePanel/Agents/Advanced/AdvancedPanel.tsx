import { useMemo, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useToastContext } from '@librechat/client';
import { ChevronLeft, Check, Copy } from 'lucide-react';
import { AgentCapabilities, PermissionTypes, Permissions } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { sectionLabelClass, groupHeadingClass } from './ui';
import { useLocalize, useHasAccess } from '~/hooks';
import { useAgentPanelContext } from '~/Providers';
import OrchestrationHub from './OrchestrationHub';
import MaxAgentSteps from './MaxAgentSteps';
import SkillsToggle from './SkillsToggle';
import { Panel } from '~/common';

export default function AdvancedPanel() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { watch } = useFormContext<AgentForm>();
  const currentAgentId = watch('id');
  const [copied, setCopied] = useState(false);

  const { agentsConfig, setActivePanel } = useAgentPanelContext();

  const handleCopyAgentId = async () => {
    if (!currentAgentId) return;
    try {
      await navigator.clipboard.writeText(currentAgentId);
      setCopied(true);
      showToast({ message: localize('com_ui_agent_id_copied'), status: 'success' });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showToast({ message: localize('com_ui_error'), status: 'error' });
    }
  };

  const skillsEnabled = useMemo(
    () => agentsConfig?.capabilities.includes(AgentCapabilities.skills) ?? false,
    [agentsConfig],
  );
  const hasSkillsAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const showSkillsKillSwitch = skillsEnabled && hasSkillsAccess;

  return (
    <div className="mb-1 flex w-full flex-col gap-4 text-sm">
      <header className="grid grid-cols-[auto_1fr_auto] items-center gap-2 pt-1">
        <button
          type="button"
          onClick={() => setActivePanel(Panel.builder)}
          aria-label={localize('com_ui_back_to_builder')}
          className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-border-light text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
        >
          <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <h2 className="text-center text-base font-semibold text-text-primary">
          {localize('com_ui_advanced_settings')}
        </h2>
        <span aria-hidden="true" className="h-10 w-10" />
      </header>

      <div className="flex flex-col gap-5 px-2 pb-2">
        <section className="flex flex-col gap-3">
          <span className={groupHeadingClass}>{localize('com_ui_essentials')}</span>
          <MaxAgentSteps />
          {showSkillsKillSwitch && <SkillsToggle />}
        </section>

        <OrchestrationHub currentAgentId={currentAgentId} />

        {currentAgentId && (
          <div className="flex items-center justify-between gap-2 border-t border-border-light pt-3">
            <span className={sectionLabelClass}>{localize('com_ui_agent_id')}</span>
            <button
              type="button"
              onClick={handleCopyAgentId}
              title={currentAgentId}
              aria-label={localize('com_ui_agent_id_copy')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
            >
              <code className="max-w-[150px] truncate font-mono text-xs">{currentAgentId}</code>
              <span className="t-icon-swap" data-state={copied ? 'b' : 'a'} aria-hidden="true">
                <span className="t-icon" data-icon="a">
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="t-icon" data-icon="b">
                  <Check className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                </span>
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
