import { usePromptGroupsContext } from '~/Providers';
import AutoSendPrompt from '../buttons/AutoSendPrompt';
import PromptSidePanel from './GroupSidePanel';
import FilterPrompts from './FilterPrompts';

export default function PromptsAccordion() {
  const groupsNav = usePromptGroupsContext();
  return (
    <div className="flex h-auto w-full flex-col px-3 pb-3">
      <PromptSidePanel
        className="h-auto space-y-2 md:mr-0 md:min-w-0 lg:w-full xl:w-full"
        {...groupsNav}
      >
        <FilterPrompts className="items-stretch" />
        <div className="flex w-full flex-row items-center justify-end">
          <AutoSendPrompt className="text-xs dark:text-white" />
        </div>
      </PromptSidePanel>
    </div>
  );
}
