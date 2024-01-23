import type { TPlugin } from 'librechat-data-provider';
import GearIcon from '~/components/svg/GearIcon';

export default function AssistantTool({ tool, allTools }: { tool: string; allTools: TPlugin[] }) {
  const currentTool = allTools.find((t) => t.pluginKey === tool);

  if (!currentTool) {
    return null;
  }

  return (
    <div>
      <div className="border-token-border-medium flex w-full rounded-lg border text-sm hover:cursor-pointer">
        {currentTool.icon && (
          <div className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full">
            <div
              className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-center bg-no-repeat dark:bg-white/20"
              style={{ backgroundImage: `url(${currentTool.icon})`, backgroundSize: 'cover' }}
            />
          </div>
        )}
        <div className="h-9 grow px-3 py-2">{currentTool.name}</div>
        <div className="w-px bg-gray-300 dark:bg-gray-600" />
        <button
          type="button"
          className="flex h-9 w-9 items-center justify-center rounded-lg rounded-l-none"
        >
          <GearIcon className="icon-sm" />
        </button>
      </div>
    </div>
  );
}
