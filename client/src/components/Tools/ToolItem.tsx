import { XCircle, PlusCircleIcon, Wrench } from 'lucide-react';
import type { TPlugin, AgentToolType } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

type ToolItemProps = {
  tool: TPlugin | AgentToolType;
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

  const name =
    (tool as AgentToolType).metadata?.name ||
    (tool as AgentToolType).tool_id ||
    (tool as TPlugin).name;
  const description =
    (tool as AgentToolType).metadata?.description || (tool as TPlugin).description || '';
  const icon = (tool as AgentToolType).metadata?.icon || (tool as TPlugin).icon;

  return (
    <div className="flex flex-col gap-4 rounded border border-border-medium bg-transparent p-6">
      <div className="flex gap-4">
        <div className="h-[70px] w-[70px] shrink-0">
          <div className="relative h-full w-full">
            {icon ? (
              <img
                src={icon}
                alt={localize('com_ui_logo', { 0: name })}
                className="h-full w-full rounded-[5px] bg-white"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-[5px] border border-border-medium bg-transparent">
                <Wrench className="h-8 w-8 text-text-secondary" />
              </div>
            )}
            <div className="absolute inset-0 rounded-[5px] ring-1 ring-inset ring-black/10"></div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col items-start justify-between">
          <div className="mb-2 line-clamp-1 max-w-full text-lg leading-5 text-text-primary">
            {name}
          </div>
          {!isInstalled ? (
            <button
              className="btn btn-primary relative"
              aria-label={`${localize('com_ui_add')} ${name}`}
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
              aria-label={`${localize('com_nav_tool_remove')} ${name}`}
            >
              <div className="flex w-full items-center justify-center gap-2">
                {localize('com_nav_tool_remove')}
                <XCircle className="flex h-4 w-4 items-center stroke-2" />
              </div>
            </button>
          )}
        </div>
      </div>
      <div className="line-clamp-3 h-[60px] text-sm text-text-secondary">{description}</div>
    </div>
  );
}

export default ToolItem;
