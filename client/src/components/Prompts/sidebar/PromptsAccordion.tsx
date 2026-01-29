import PromptSidePanel from './GroupSidePanel';
import FilterPrompts from './FilterPrompts';
import { usePromptGroupsContext } from '~/Providers';
import AutoSendPrompt from '../buttons/AutoSendPrompt';

export default function PromptsAccordion() {
  const groupsNav = usePromptGroupsContext();
  return (
    <div className="flex h-full w-full flex-col">
      <PromptSidePanel className="mt-2 space-y-2 lg:w-full xl:w-full" {...groupsNav}>
        <FilterPrompts className="items-center justify-center" />

        <AutoSendPrompt />
      </PromptSidePanel>
    </div>
  );
}
