import { useState, useMemo, memo } from 'react';
import { Menu as MenuIcon, Edit as EditIcon, TextSearch } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@librechat/client';
import type { TPromptGroup, MCPPromptResponse } from 'librechat-data-provider';
import { useLocalize, useSubmitMessage, useCustomLink } from '~/hooks';
import VariableDialog from '~/components/Prompts/Groups/VariableDialog';
import PreviewPrompt from '~/components/Prompts/PreviewPrompt';
import ListCard from '~/components/Prompts/Groups/ListCard';
import { detectVariables } from '~/utils';

function PromptGroupItem({
  mcpPrompt,
  instanceProjectId,
  agentAddPrompts,
}: {
  mcpPrompt: MCPPromptResponse;
  group: TPromptGroup;
  instanceProjectId?: string;
  agentAddPrompts?: boolean;
}) {
  const localize = useLocalize();
  const { submitPrompt } = useSubmitMessage();
  const [isPreviewDialogOpen, setPreviewDialogOpen] = useState(false);
  const [isVariableDialogOpen, setVariableDialogOpen] = useState(false);
  const onEditClick = useCustomLink<HTMLDivElement>(`/d/prompts/${instanceProjectId}`);

  const onCardClick: React.MouseEventHandler<HTMLButtonElement> = () => {
    const text = mcpPrompt?.description;
    mcpPrompt.mcpServerName = mcpPrompt?.mcpServerName ?? mcpPrompt.promptKey.split('_mcp_')[1];
    if (!text?.trim()) {
      return;
    }

    if (detectVariables(text)) {
      setVariableDialogOpen(true);
      return;
    }

    submitPrompt(text, true);
  };

  return (
    <>
      <ListCard
        name={mcpPrompt.name}
        category={'mcpServer'}
        onClick={onCardClick}
        snippet={`On MCP Server: ${mcpPrompt.mcpServerName || mcpPrompt.promptKey.split('_mcp_')[1]}`}
      >
        <div className="flex flex-row items-center gap-2">
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button
                id={`prompt-actions-${instanceProjectId}`}
                aria-label={`${mcpPrompt.name} - Actions Menu`}
                aria-expanded="false"
                aria-controls={`prompt-menu-${instanceProjectId}`}
                aria-haspopup="menu"
                onClick={(e) => {
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.stopPropagation();
                  }
                }}
                className="z-50 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border-medium bg-transparent p-0 text-sm font-medium transition-all duration-300 ease-in-out hover:border-border-heavy hover:bg-surface-hover focus:border-border-heavy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
              >
                <MenuIcon className="icon-md text-text-secondary" aria-hidden="true" />
                <span className="sr-only">
                  {localize('com_ui_sr_actions_menu', { 0: mcpPrompt.name }) +
                    ' ' +
                    localize('com_ui_prompt')}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              id={`prompt-menu-${instanceProjectId}`}
              aria-label={`Available actions for ${mcpPrompt.name}`}
              className="z-50 w-fit rounded-xl"
              collisionPadding={2}
              align="end"
            >
              <DropdownMenuItem
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setPreviewDialogOpen(true);
                }}
                className="w-full cursor-pointer rounded-lg text-text-secondary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
              >
                <TextSearch className="mr-2 h-4 w-4" aria-hidden="true" />
                <span>{localize('com_ui_preview')}</span>
              </DropdownMenuItem>
              {
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    disabled={true}
                    className="cursor-pointer rounded-lg text-text-secondary hover:bg-surface-hover focus:bg-surface-hover disabled:cursor-not-allowed"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditClick(e);
                    }}
                  >
                    <EditIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                    <span>{localize('com_ui_edit')}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              }
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </ListCard>
      <PreviewPrompt
        group={[]}
        mcpPrompt={mcpPrompt}
        open={isPreviewDialogOpen}
        onOpenChange={setPreviewDialogOpen}
        mcp={true}
      />
      <VariableDialog
        open={isVariableDialogOpen}
        onClose={() => setVariableDialogOpen(false)}
        group={mcpPrompt}
        mcpPrompt={mcpPrompt}
        mcp={true}
        addPrompt={agentAddPrompts}
      />
    </>
  );
}

export default memo(PromptGroupItem);
