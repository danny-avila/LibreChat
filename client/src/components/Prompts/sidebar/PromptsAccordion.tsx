import { SystemRoles } from 'librechat-data-provider';
import { usePromptGroupsContext } from '~/Providers';
import { useAuthContext } from '~/hooks';
import { AdminSettings } from '~/components/Prompts';
import AutoSendPrompt from '../buttons/AutoSendPrompt';
import PromptSidePanel from './GroupSidePanel';
import FilterPrompts from './FilterPrompts';

export default function PromptsAccordion() {
  const groupsNav = usePromptGroupsContext();
  const { user } = useAuthContext();
  return (
    <div className="flex h-auto w-full flex-col px-3 pb-3">
      <PromptSidePanel
        className="h-auto space-y-2 md:mr-0 md:min-w-0 lg:w-full xl:w-full"
        {...groupsNav}
      >
        <FilterPrompts />
        <div className="flex w-full items-center justify-end gap-2">
          {user?.role === SystemRoles.ADMIN && <AdminSettings />}
          <AutoSendPrompt />
        </div>
      </PromptSidePanel>
    </div>
  );
}
