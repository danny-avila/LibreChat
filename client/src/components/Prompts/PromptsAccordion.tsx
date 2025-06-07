import React, { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import PromptSidePanel from '~/components/Prompts/Groups/GroupSidePanel';
import FilterPrompts from '~/components/Prompts/Groups/FilterPrompts';
import ManagePrompts from '~/components/Prompts/ManagePrompts';
import CreatePrompt from '~/components/Prompts/CreatePrompt';
import { usePromptGroupsNav } from '~/hooks';

export default function PromptsAccordion() {
  const location = useLocation();
  const groupsNav = usePromptGroupsNav();
  const isChatRoute = useMemo(() => location.pathname?.startsWith('/c/'), [location.pathname]);

  return (
    <div className="mt-2 flex h-full w-full flex-col">
      <PromptSidePanel isChatRoute={isChatRoute} className="lg:w-full xl:w-full" {...groupsNav}>
        <FilterPrompts setName={groupsNav.setName} className="items-center justify-center" />
        <div className="flex w-full flex-row items-center justify-between gap-2">
          <ManagePrompts className="select-none" />
          <CreatePrompt isChatRoute={isChatRoute} />
        </div>
      </PromptSidePanel>
    </div>
  );
}
