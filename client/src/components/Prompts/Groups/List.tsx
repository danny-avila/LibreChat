import type { TPromptGroup, TStartupConfig } from 'librechat-data-provider';
import {
  RankablePromptList,
  SortedPromptList,
  RankingProvider,
} from '~/components/Prompts/Groups/RankingComponent';
import DashGroupItem from '~/components/Prompts/Groups/DashGroupItem';
import ChatGroupItem from '~/components/Prompts/Groups/ChatGroupItem';
import { useGetStartupConfig } from '~/data-provider';
import { Skeleton } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { useMemo } from 'react';

interface ListProps {
  groups?: TPromptGroup[];
  isChatRoute: boolean;
  isLoading: boolean;
  enableRanking?: boolean;
}

export default function List({
  groups = [],
  isChatRoute,
  isLoading,
  enableRanking = true,
}: ListProps) {
  const localize = useLocalize();
  const { data: startupConfig = {} as Partial<TStartupConfig> } = useGetStartupConfig();
  const { instanceProjectId } = startupConfig;

  const renderGroupItem = useMemo(
    () => (group: TPromptGroup) => {
      const Component = isChatRoute ? ChatGroupItem : DashGroupItem;
      return <Component key={group._id} group={group} instanceProjectId={instanceProjectId} />;
    },
    [isChatRoute, instanceProjectId],
  );

  const emptyMessage = localize('com_ui_nothing_found');

  if (isLoading) {
    return (
      <RankingProvider>
        <div className="flex h-full flex-col">
          <div className="flex-grow overflow-y-auto">
            <div className="overflow-y-auto overflow-x-hidden">
              {isChatRoute ? (
                <Skeleton className="my-2 flex h-[84px] w-full rounded-2xl border-0 px-3 pb-4 pt-3" />
              ) : (
                Array.from({ length: 10 }).map((_, index) => (
                  <Skeleton
                    key={index}
                    className="w-100 mx-2 my-2 flex h-14 rounded-lg border-0 p-4"
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </RankingProvider>
    );
  }

  if (groups.length === 0) {
    return (
      <RankingProvider>
        <div className="flex h-full flex-col">
          <div className="flex-grow overflow-y-auto">
            <div className="overflow-y-auto overflow-x-hidden">
              {isChatRoute ? (
                <div className="my-2 flex h-[84px] w-full items-center justify-center rounded-2xl border border-border-light bg-transparent px-3 pb-4 pt-3 text-text-primary">
                  {emptyMessage}
                </div>
              ) : (
                <div className="my-12 flex w-full items-center justify-center text-lg font-semibold text-text-primary">
                  {emptyMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </RankingProvider>
    );
  }

  const shouldUseRanking = !isChatRoute && enableRanking;

  const renderContent = () => {
    if (isChatRoute) {
      return <SortedPromptList groups={groups} renderItem={renderGroupItem} />;
    }
    if (shouldUseRanking) {
      return <RankablePromptList groups={groups} renderItem={renderGroupItem} />;
    }
    return groups.map((group) => renderGroupItem(group));
  };

  return (
    <RankingProvider>
      <div className="flex h-full flex-col">
        <div className="flex-grow overflow-y-auto">
          <div className="overflow-y-auto overflow-x-hidden">{renderContent()}</div>
        </div>
      </div>
    </RankingProvider>
  );
}
