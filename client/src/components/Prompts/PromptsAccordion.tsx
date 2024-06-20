import PromptSidePanel from '~/components/Prompts/Groups/GroupSidePanel';
import AutoSendPrompt from '~/components/Prompts/Groups/AutoSendPrompt';
import FilterPrompts from '~/components/Prompts/Groups/FilterPrompts';
import ManagePrompts from '~/components/Prompts/ManagePrompts';
import { usePromptGroupsNav } from '~/hooks';

export default function PromptsAccordion() {
  const groupsNav = usePromptGroupsNav();
  return (
    <div className="flex h-full w-full flex-col">
      <PromptSidePanel className="lg:w-full xl:w-full" {...groupsNav}>
        <div className="flex w-full flex-row items-center justify-between px-2 pt-2">
          <ManagePrompts className="select-none" />
          <AutoSendPrompt className="text-xs dark:text-white" />
        </div>
        <FilterPrompts setName={groupsNav.setName} className="items-center justify-center px-2" />
      </PromptSidePanel>
    </div>
  );
}
