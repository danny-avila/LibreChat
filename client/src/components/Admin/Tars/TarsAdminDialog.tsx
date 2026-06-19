import { useState } from 'react';
import { OGDialog, OGDialogTemplate } from '@librechat/client';
import type { RefObject } from 'react';
import DomainManager from './DomainManager';
import KnowledgeManager from './KnowledgeManager';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type Tab = 'domains' | 'knowledge';

export default function TarsAdminDialog({
  open,
  onOpenChange,
  triggerRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  triggerRef?: RefObject<HTMLButtonElement>;
}) {
  const localize = useLocalize();
  const [tab, setTab] = useState<Tab>('domains');

  const tabClass = (active: boolean) =>
    cn(
      'px-3 py-1.5 text-sm font-medium rounded-lg transition-colors',
      active
        ? 'bg-surface-tertiary text-text-primary'
        : 'text-text-secondary hover:bg-surface-hover',
    );

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      <OGDialogTemplate
        title={localize('com_ui_tars_admin_title')}
        showCloseButton={true}
        className="w-11/12 md:max-w-2xl"
        main={
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                type="button"
                className={tabClass(tab === 'domains')}
                onClick={() => setTab('domains')}
              >
                {localize('com_ui_tars_domains')}
              </button>
              <button
                type="button"
                className={tabClass(tab === 'knowledge')}
                onClick={() => setTab('knowledge')}
              >
                {localize('com_ui_tars_knowledge_bases')}
              </button>
            </div>
            {tab === 'domains' ? <DomainManager /> : <KnowledgeManager />}
          </div>
        }
      />
    </OGDialog>
  );
}
