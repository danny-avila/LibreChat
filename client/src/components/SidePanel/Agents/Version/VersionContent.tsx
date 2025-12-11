import { Spinner } from '@librechat/client';
import type { VersionContext } from './types';
import VersionItem from './VersionItem';
import { useLocalize } from '~/hooks';

type VersionContentProps = {
  selectedAgentId: string;
  isLoading: boolean;
  error: unknown;
  versionContext: VersionContext;
  onRestore: (index: number) => void;
};

export default function VersionContent({
  selectedAgentId,
  isLoading,
  error,
  versionContext,
  onRestore,
}: VersionContentProps) {
  const { versions, versionIds } = versionContext;
  const localize = useLocalize();

  if (!selectedAgentId) {
    return (
      <div className="py-8 text-center text-text-secondary">
        {localize('com_ui_agent_version_no_agent')}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8 text-center text-red-500">{localize('com_ui_agent_version_error')}</div>
    );
  }

  if (versionIds.length > 0) {
    return (
      <div className="flex flex-col gap-2">
        {versionIds.map(({ id, version, isActive }) => (
          <VersionItem
            key={id}
            version={version}
            index={id}
            isActive={isActive}
            versionsLength={versions.length}
            onRestore={onRestore}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="py-8 text-center text-text-secondary">
      {localize('com_ui_agent_version_empty')}
    </div>
  );
}
