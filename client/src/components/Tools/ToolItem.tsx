import { TPlugin } from 'librechat-data-provider';
import { XCircle, PlusCircleIcon } from 'lucide-react';
import { useLocalize } from '~/hooks';

type ToolItemProps = {
  tool: TPlugin;
  onAddTool: () => void;
  onRemoveTool: () => void;
  isInstalled?: boolean;
};

function ToolItem({ tool, onAddTool, onRemoveTool, isInstalled = false }: ToolItemProps) {
  const localize = useLocalize();
  const handleClick = () => {
    if (isInstalled) {
      onRemoveTool();
    } else {
      onAddTool();
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded border border-border-medium bg-transparent p-6">
      <div className="flex gap-4">
        <div className="h-[70px] w-[70px] shrink-0">
          <div className="relative h-full w-full">
            <img
              src={tool.icon}
              alt={localize('com_ui_logo', tool.name)}
              className="h-full w-full rounded-[5px] bg-white"
            />
            <div className="absolute inset-0 rounded-[5px] ring-1 ring-inset ring-black/10"></div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-start justify-between">
          <div className="mb-2 line-clamp-1 max-w-full text-lg leading-5 text-text-primary">
            {tool.name}
          </div>
          {!isInstalled ? (
            <button
              className="btn btn-primary relative"
              aria-label={`${localize('com_ui_add')} ${tool.name}`}
              onClick={handleClick}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_ui_add')}
                <PlusCircleIcon className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          ) : (
            <button
              className="btn relative bg-gray-300 hover:bg-gray-400 dark:bg-gray-50 dark:hover:bg-gray-200"
              onClick={handleClick}
              aria-label={`${localize('com_nav_tool_remove')} ${tool.name}`}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_nav_tool_remove')}
                <XCircle className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          )}
        </div>
      </div>
      <div className="line-clamp-3 h-[60px] text-sm text-gray-700/70 dark:text-gray-50/70">
        {tool.description}
      </div>
    </div>
  );
}

export default ToolItem;
