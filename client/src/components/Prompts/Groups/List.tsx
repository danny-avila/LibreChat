import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, Skeleton } from '@librechat/client';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup, TStartupConfig, TMCPPromptArgument } from 'librechat-data-provider';
import DashGroupItem from '~/components/Prompts/Groups/DashGroupItem';
import ChatGroupItem from '~/components/Prompts/Groups/ChatGroupItem';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import DashGroupMCPItem from '~/components/Prompts/Groups/DashGroupMCPItem';
import DashGroupMCPAddItem from '~/components/Prompts/Groups/DashGroupMCPAddItem';
import PromptGroupItem from '~/components/Prompts/Groups/PromptGroupItem';
import { useForm, FormProvider } from 'react-hook-form';

export default function List({
  groups = [],
  mcpPrompts = [],
  isChatRoute,
  isLoading,
  agentAddPrompts,
}: {
  groups?: TPromptGroup[];
  mcpPrompts?: TMCPPromptArgument[];
  isChatRoute: boolean;
  isLoading: boolean;
  agentAddPrompts?: boolean;
}) {
  const navigate = useNavigate();
  const localize = useLocalize();
  const { data: startupConfig = {} as Partial<TStartupConfig> } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  const methods = useForm({
    defaultValues: {
      prompt: mcpPrompts?.description,
      promptName: mcpPrompts ? mcpPrompts?.name : '',
      category: 'mcpServer',
    },
  });

  return (
    <div className="flex h-full flex-col">
      {hasCreateAccess && (
        <div className="flex w-full justify-end">
          <Button
            variant="outline"
            className={`w-full bg-transparent ${isChatRoute ? '' : 'mx-2'}`}
            onClick={() => navigate('/d/prompts/new')}
            aria-label={localize('com_ui_create_prompt')}
          >
            <Plus className="size-4" aria-hidden />
            {localize('com_ui_create_prompt')}
          </Button>
        </div>
      )}
      <div className="flex-grow overflow-y-auto" aria-label={localize('com_ui_prompt_groups')}>
        <div className="overflow-y-auto overflow-x-hidden">
          {isLoading && isChatRoute && (
            <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
          )}
          {isLoading &&
            !isChatRoute &&
            Array.from({ length: 10 }).map((_, index: number) => (
              <Skeleton key={index} className="w-100 mx-2 my-2 flex h-14 rounded-lg border-0 p-4" />
            ))}
          {!isLoading && groups.length === 0 && isChatRoute && mcpPrompts.length == 0 && (
            <div className="my-2 flex h-[84px] w-full items-center justify-center rounded-2xl border border-border-light bg-transparent px-3 pb-4 pt-3 text-text-primary">
              {localize('com_ui_nothing_found')}
            </div>
          )}
          {!isLoading && groups.length === 0 && !isChatRoute && mcpPrompts.length == 0 && (
            <div className="my-12 flex w-full items-center justify-center text-lg font-semibold text-text-primary">
              {localize('com_ui_nothing_found')}
            </div>
          )}
          {groups.map((group) => {
            if (isChatRoute) {
              return (
                <ChatGroupItem
                  key={group._id}
                  group={group}
                  instanceProjectId={instanceProjectId}
                />
              );
            }
            return (
              <DashGroupItem key={group._id} group={group} instanceProjectId={instanceProjectId} />
            );
          })}
          {mcpPrompts &&
            typeof mcpPrompts === 'object' &&
            Object.keys(mcpPrompts).length > 0 &&
            Object.entries(mcpPrompts).map(([index, mcpPrompt]) => {
              if (typeof mcpPrompt !== 'object' || mcpPrompt === null) {
                return null;
              }
              const instanceSplit = index.split('_mcp_');
              (mcpPrompt as any).mcpServerName = instanceSplit[1];
              if (agentAddPrompts) {
                return (
                  <FormProvider {...methods} key={index}>
                    <DashGroupMCPAddItem
                      key={index}
                      mcpPrompt={mcpPrompt}
                      instanceProjectId={index}
                      agentAddPrompts={agentAddPrompts}
                    />
                  </FormProvider>
                );
              } else {
                if (isChatRoute) {
                  return (
                    <PromptGroupItem
                      key={index}
                      mcpPrompt={{
                        ...mcpPrompt,
                        description: mcpPrompt.description ?? '',
                      }}
                      instanceProjectId={index}
                      group={{
                        name: mcpPrompt.name,
                        numberOfGenerations: undefined,
                        command: undefined,
                        oneliner: undefined,
                        category: undefined,
                        projectIds: undefined,
                        productionId: undefined,
                        productionPrompt: undefined,
                        author: (mcpPrompt as any).mcpServerName,
                        authorName: 'MCP Server',
                        createdAt: undefined,
                        updatedAt: undefined,
                        _id: undefined,
                      }}
                    />
                  );
                }
                return (
                  <DashGroupMCPItem key={index} mcpPrompt={mcpPrompt} instanceProjectId={index} />
                );
              }
            })}
        </div>
      </div>
    </div>
  );
}
