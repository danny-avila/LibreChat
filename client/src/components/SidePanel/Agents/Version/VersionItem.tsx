import { useLocalize } from '~/hooks';
import { VersionRecord } from './VersionPanel';

type VersionItemProps = {
  version: VersionRecord;
  index: number;
  isActive: boolean;
  versionsLength: number;
  onRestore: (index: number) => void;
};

export default function VersionItem({
  version,
  index,
  isActive,
  versionsLength,
  onRestore,
}: VersionItemProps) {
  const localize = useLocalize();

  const getVersionTimestamp = (version: VersionRecord): string => {
    const timestamp = version.updatedAt || version.createdAt;

    if (timestamp) {
      try {
        const date = new Date(timestamp);
        if (isNaN(date.getTime()) || date.toString() === 'Invalid Date') {
          return localize('com_ui_agent_version_unknown_date');
        }
        return date.toLocaleString();
      } catch (error) {
        return localize('com_ui_agent_version_unknown_date');
      }
    }

    return localize('com_ui_agent_version_no_date');
  };

  return (
    <div className="rounded-md border border-border-light p-3">
      <div className="flex items-center justify-between font-medium">
        <span>
          {localize('com_ui_agent_version_title', { versionNumber: versionsLength - index })}
        </span>
        {isActive && (
          <span className="rounded-full border border-green-600 bg-green-600/20 px-2 py-0.5 text-xs font-medium text-green-700 dark:border-green-500 dark:bg-green-500/30 dark:text-green-300">
            {localize('com_ui_agent_version_active')}
          </span>
        )}
      </div>
      <div className="text-sm text-text-secondary">{getVersionTimestamp(version)}</div>
      {!isActive && (
        <button
          className="mt-2 text-sm text-blue-500 hover:text-blue-600"
          onClick={() => {
            if (window.confirm(localize('com_ui_agent_version_restore_confirm'))) {
              onRestore(index);
            }
          }}
          aria-label={localize('com_ui_agent_version_restore')}
        >
          {localize('com_ui_agent_version_restore')}
        </button>
      )}
    </div>
  );
}
