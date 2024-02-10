import type { TPlugin } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';
import { cn } from '~/utils';

export default function AssistantTool({
  tool,
  allTools,
  assistant_id,
}: {
  tool: string;
  allTools: TPlugin[];
  assistant_id?: string;
}) {
  const currentTool = allTools.find((t) => t.pluginKey === tool);

  if (!currentTool) {
    return null;
  }

  return (
    <div>
      <div
        className={cn(
          'border-token-border-medium flex w-full rounded-lg border text-sm hover:cursor-pointer',
          !assistant_id ? 'opacity-40' : '',
        )}
      >
        {currentTool.icon && (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
            <div
              className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
              style={{ backgroundImage: `url(${currentTool.icon})`, backgroundSize: 'cover' }}
            />
          </div>
        )}
        <div
          className="h-9 grow px-3 py-2"
          style={{ textOverflow: 'ellipsis', wordBreak: 'break-all', overflow: 'hidden' }}
        >
          {currentTool.name}
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
