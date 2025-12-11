import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import type { PromptOption } from '~/common';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import { usePromptGroupsNav, useHasAccess } from '~/hooks';
import { useGetAllPromptGroups } from '~/data-provider';
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

  const contextValue = useMemo(
    () => ({
      ...promptGroupsNav,
      allPromptGroups: {
        data: hasAccess ? allGroupsData : undefined,
        isLoading: hasAccess ? isLoadingAll : false,
      },
      hasAccess,
    }),
    [promptGroupsNav, allGroupsData, isLoadingAll, hasAccess],
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
