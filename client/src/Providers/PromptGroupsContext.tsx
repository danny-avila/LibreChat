import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type {
  TPromptGroup,
  MCPPromptResponseArray,
  MCPPromptResponse,
} from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useGetAllMCPPrompts, useGetAllPromptGroups } from '~/data-provider';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { usePromptGroupsNav, useHasAccess } from '~/hooks';
import { mapPromptGroups } from '~/utils';

type AllPromptGroupsData =
  | {
      promptsMap: Record<string, TPromptGroup>;
      promptGroups: PromptOption[];
    }
  | undefined;

type PromptGroupsContextType =
  | (ReturnType<typeof usePromptGroupsNav> & {
      allPromptGroups: {
        data: AllPromptGroupsData;
        isLoading: boolean;
      };
      mcpPromptsResponse: {
        mcpData: MCPPromptResponse[];
        mcpIsLoading: boolean;
      };
      hasAccess: boolean;
    })
  | null;

const PromptGroupsContext = createContext<PromptGroupsContextType>(null);

export const PromptGroupsProvider = ({ children }: { children: ReactNode }) => {
  const hasAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.USE,
  });

  const promptGroupsNav = usePromptGroupsNav(hasAccess);
  const { data: allGroupsData, isLoading: isLoadingAll } = useGetAllPromptGroups(undefined, {
    enabled: hasAccess,
    select: (data) => {
      const mappedArray: PromptOption[] = data.map((group) => ({
        id: group._id ?? '',
        type: 'prompt',
        value: group.command ?? group.name,
        label: `${group.command != null && group.command ? `/${group.command} - ` : ''}${
          group.name
        }: ${
          (group.oneliner?.length ?? 0) > 0
            ? group.oneliner
            : (group.productionPrompt?.prompt ?? '')
        }`,
        icon: <CategoryIcon category={group.category ?? ''} className="h-5 w-5" />,
      }));

      const promptsMap = mapPromptGroups(data);

      return {
        promptsMap,
        promptGroups: mappedArray,
      };
    },
  });

  const { data: mcpPromptsData, isLoading: mcpIsLoading } = useGetAllMCPPrompts({
    select: (data: MCPPromptResponseArray): MCPPromptResponse[] => {
      const allPrompts = Object.entries(data).map(([key, prompt]) => {
        const typedPrompt = prompt as MCPPromptResponse;
        const serverName = typedPrompt.mcpServerName
          ? typedPrompt.mcpServerName
          : key.split('_mcp_')[1];
        return {
          name: typedPrompt.name,
          description: typedPrompt.description ?? '',
          promptKey: typedPrompt.name + '_mcp_' + typedPrompt.mcpServerName,
          mcpServerName: typedPrompt.mcpServerName ?? serverName,
          category: 'mcpServer',
          authorName: 'MCP Server',
          arguments: typedPrompt.arguments,
        };
      });

      if (promptGroupsNav.name) {
        const codePrompts = allPrompts.filter((prompt) => {
          const hasCodeInName = prompt.name
            .toLowerCase()
            .includes(promptGroupsNav.name.toLowerCase());
          console.log(`Filtering "${prompt.name}" (name defined):`, hasCodeInName);
          return hasCodeInName;
        });
        console.log("Filtered prompts (name is defined):", codePrompts);
        return codePrompts;
      } else {
        return allPrompts;
      }
    },
  });

  console.log("MCP Prompts Data:", mcpPromptsData);

  const contextValue = useMemo(() => {
    return {
      ...promptGroupsNav,
      allPromptGroups: {
        data: hasAccess ? allGroupsData : undefined,
        isLoading: hasAccess ? isLoadingAll : false,
      },
      mcpPromptsResponse: {
        mcpData: mcpPromptsData ?? [],
        mcpIsLoading: mcpIsLoading,
      },
      hasAccess,
    };
  }, [promptGroupsNav, hasAccess, allGroupsData, isLoadingAll, mcpPromptsData, mcpIsLoading]);

  return (
    <PromptGroupsContext.Provider value={contextValue}>{children}</PromptGroupsContext.Provider>
  );
};

export const usePromptGroupsContext = () => {
  const context = useContext(PromptGroupsContext);
  if (!context) {
    throw new Error('usePromptGroupsContext must be used within a PromptGroupsProvider');
  }
  return context;
};
