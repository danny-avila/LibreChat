import PromptSidePanel from '~/components/Prompts/Groups/GroupSidePanel';
import AutoSendPrompt from '~/components/Prompts/Groups/AutoSendPrompt';
import FilterPrompts from '~/components/Prompts/Groups/FilterPrompts';
import { usePromptGroupsContext } from '~/Providers';

export default function PromptsAccordion() {
  const groupsNav = usePromptGroupsContext();
  return (
    <div className="flex h-full w-full flex-col">
      <PromptSidePanel className="mt-2 space-y-2 lg:w-full xl:w-full" {...groupsNav}>
        <FilterPrompts setName={groupsNav.setName} className="items-center justify-center" />
        <div className="flex w-full flex-row items-center justify-end">
          <AutoSendPrompt className="text-xs dark:text-white" />
        </div>
      </PromptSidePanel>
    </div>
  );
}
