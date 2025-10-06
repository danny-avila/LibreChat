import React, { createContext, useContext, ReactNode, useMemo, useState, useEffect } from 'react';
import type { TMCPPromptArgument, MCPPromptResponse } from 'librechat-data-provider';
import { dataService } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import { usePromptGroupsNav } from '~/hooks';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';

const fetchMCPPrompts = async (): Promise<MCPPromptResponse[]> => {
  try {
    // Use LibreChat's existing dataService pattern
    const response = await dataService.allMCPPrompts();
    const mappedArray: MCPPromptResponse[] = response.map((prompt) => ({
      id: prompt.name ?? '',
      name: prompt.name ?? '',
      type: 'mcpPrompt',
      value: prompt.name,
      label: `On MCP Server: ${prompt?.mcpServerName || prompt.promptKey.split('_mcp_')[1]}`,
      icon: <CategoryIcon category={'mcpServer'} className="h-5 w-5" />,
      description: prompt.description ?? '',
      mcpServerName: prompt.mcpServerName ?? '',
      promptKey: prompt.promptKey ?? '',
    }));

    return mappedArray || [];
  } catch (error) {
    console.warn('MCP prompts not available:', error);
    return [];
  }
};

type AllMCPPromptGroupsData =
  | {
      promptsMap: Record<string, TMCPPromptArgument>;
      promptGroups: PromptOption[];
    }
  | undefined;

type MCPPromptGroupsContextType =
  | (ReturnType<typeof usePromptGroupsNav> & {
      allMCPPromptGroups: {
        data: AllMCPPromptGroupsData;
        isLoading: boolean;
      };
    })
  | null;

const MCPPromptGroupsContext = createContext<MCPPromptGroupsContextType>(null);

export const MCPPromptGroupsProvider = ({ children }: { children: ReactNode }) => {
  const mcpPromptGroupsNav = usePromptGroupsNav();
  const [data, setData] = useState<AllMCPPromptGroupsData>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetchMCPPrompts()
      .then((prompts) => {
        if (isMounted) {
          setData(prompts as unknown as AllMCPPromptGroupsData);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setData(undefined);
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const contextValue = useMemo(
    () => ({
      ...mcpPromptGroupsNav,
      allMCPPromptGroups: {
        data,
        isLoading,
      },
    }),
    [mcpPromptGroupsNav, data, isLoading],
  );

  return (
    <MCPPromptGroupsContext.Provider value={contextValue}>
      {children}
    </MCPPromptGroupsContext.Provider>
  );
};
export const useMCPPromptGroupsContext = () => {
  const context = useContext(MCPPromptGroupsContext);
  // if (!context) {
  //   throw new Error('useMCPPromptGroupsContext must be used within a PromptGroupsProvider');
  // }
  return context;
};
