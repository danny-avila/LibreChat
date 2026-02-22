import { useMemo, useState } from 'react';
import { Globe, Folder, Database } from 'lucide-react';
import { Spinner } from '@librechat/client';
import type { TMemoryDocument } from 'librechat-data-provider';
import { useMemoryDocuments, useUserProjects } from '~/data-provider';
import { useLocalize } from '~/hooks';
import MemoryDocumentEditor from './MemoryDocumentEditor';

interface MemoryScopeTabsProps {
  legacyPanel: React.ReactNode;
}

export default function MemoryScopeTabs({ legacyPanel }: MemoryScopeTabsProps) {
  const localize = useLocalize();
  const [activeTab, setActiveTab] = useState<string>('global');
  const { data: docsData, isLoading: docsLoading } = useMemoryDocuments();
  const { data: projectsData, isLoading: projectsLoading } = useUserProjects();

  const documents = useMemo(() => docsData?.documents ?? [], [docsData]);
  const projects = useMemo(() => projectsData?.projects ?? [], [projectsData]);

  const docsMap = useMemo(() => {
    const map = new Map<string, TMemoryDocument>();
    for (const doc of documents) {
      const key = doc.scope === 'global' ? 'global' : `project:${doc.projectId}`;
      map.set(key, doc);
    }
    return map;
  }, [documents]);

  const tabs = useMemo(() => {
    return [
      { id: 'global', label: localize('com_ui_global'), icon: Globe },
      ...projects.map((p) => ({
        id: `project:${p._id}`,
        label: p.name,
        icon: Folder,
      })),
      { id: 'legacy', label: localize('com_ui_legacy_memories'), icon: Database },
    ];
  }, [projects, localize]);

  if (docsLoading || projectsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const activeDoc = docsMap.get(activeTab) ?? null;
  const isLegacy = activeTab === 'legacy';
  const isProject = activeTab.startsWith('project:');
  const projectId = isProject ? activeTab.replace('project:', '') : undefined;
  const scope = isProject ? 'project' : 'global';

  return (
    <div className="flex h-full flex-col gap-2">
      <div className="flex gap-1 overflow-x-auto border-b border-border-light pb-1" role="tablist">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              className={`flex shrink-0 items-center gap-1 rounded-t-md px-2 py-1 text-xs transition-colors ${
                isActive
                  ? 'border-b-2 border-green-500 font-medium text-text-primary'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
              }`}
            >
              <Icon className="size-3" />
              <span className="max-w-[80px] truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-hidden" role="tabpanel">
        {isLegacy ? (
          legacyPanel
        ) : (
          <MemoryDocumentEditor
            key={activeTab}
            document={activeDoc}
            scope={scope as 'global' | 'project'}
            projectId={projectId}
          />
        )}
      </div>
    </div>
  );
}
