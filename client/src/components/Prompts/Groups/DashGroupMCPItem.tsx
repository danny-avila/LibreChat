import { memo, useCallback, KeyboardEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { TMCPPromptArgument } from 'librechat-data-provider';
import { Label } from '@librechat/client';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { cn } from '~/utils';

interface DashGroupItemMCPProps {
  mcpPrompt: TMCPPromptArgument;
  instanceProjectId?: string;
}

function DashGroupItemMCPComponent({ mcpPrompt }: DashGroupItemMCPProps) {
  const params = useParams();
  const navigate = useNavigate();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        navigate(`/d/prompts/mcp/${mcpPrompt.promptKey}`, { replace: true });
      }
    },
    [mcpPrompt.promptKey, navigate],
  );

  const handleContainerClick = useCallback(() => {
    navigate(`/d/prompts/mcp/${mcpPrompt.promptKey}`, { replace: true });
  }, [mcpPrompt.promptKey, navigate]);

  return (
    <div
      className={cn(
        'mx-2 my-2 flex cursor-pointer rounded-lg border border-border-light bg-surface-primary p-3 shadow-sm transition-all duration-300 ease-in-out hover:bg-surface-secondary',
        params.promptId === mcpPrompt.promptKey && 'bg-surface-hover',
      )}
      onClick={handleContainerClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={`${mcpPrompt.name} prompt group`}
    >
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2 truncate pr-2">
          <CategoryIcon category={'mcpServer'} className="icon-lg" aria-hidden="true" />
          <Label className="text-md cursor-pointer truncate font-semibold text-text-primary">
            {mcpPrompt.name}
          </Label>
        </div>
      </div>
    </div>
  );
}

export default memo(DashGroupItemMCPComponent);
