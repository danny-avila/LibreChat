import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import type { TPromptGroup } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { useGetAllPromptGroups } from '~/data-provider';
import { usePromptGroupsNav } from '~/hooks';
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
    })
  | null;

const PromptGroupsContext = createContext<PromptGroupsContextType>(null);

export const PromptGroupsProvider = ({ children }: { children: ReactNode }) => {
  const promptGroupsNav = usePromptGroupsNav();
  const { data: allGroupsData, isLoading: isLoadingAll } = useGetAllPromptGroups(undefined, {
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

  const contextValue = useMemo(
    () => ({
      ...promptGroupsNav,
      allPromptGroups: {
        data: allGroupsData,
        isLoading: isLoadingAll,
      },
    }),
    [promptGroupsNav, allGroupsData, isLoadingAll],
  );

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
