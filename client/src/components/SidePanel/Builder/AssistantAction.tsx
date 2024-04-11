import type { Action } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';

export default function AssistantAction({
  action,
  onClick,
}: {
  action: Action;
  onClick: () => void;
}) {
  return (
    <div>
      <div
        onClick={onClick}
        className="border-token-border-medium flex w-full rounded-lg border text-sm hover:cursor-pointer"
      >
        <div
          className="h-9 grow px-3 py-2"
          style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
        >
          {action.metadata.domain}
        </div>
        <div className="w-px bg-gray-300 dark:bg-gray-600" />
        <button
          type="button"
          className="flex h-9 w-9 min-w-9 items-center justify-center rounded-lg rounded-l-none"
        >
          <GearIcon className="icon-sm" />
        </button>
      </div>
    </div>
  );
}
