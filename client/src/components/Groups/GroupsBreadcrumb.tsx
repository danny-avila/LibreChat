import { useCallback } from 'react';
import { useRecoilState } from 'recoil';
import { ArrowLeft, Users } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
} from '@librechat/client';
import { useLocalize, useCustomLink } from '~/hooks';
import { useDashboardContext } from '~/Providers';
import store from '~/store';

const getConversationId = (prevLocationPath: string) => {
  if (!prevLocationPath || prevLocationPath.includes('/d/')) {
    return 'new';
  }
  const lastPathnameParts = prevLocationPath.split('/');
  return lastPathnameParts[lastPathnameParts.length - 1];
};

export default function GroupsBreadcrumb() {
  const localize = useLocalize();
  const { prevLocationPath } = useDashboardContext();
  
  const lastConversationId = getConversationId(prevLocationPath);
  
  // TODO: Add group state to store later
  const clickCallback = useCallback(() => {
    // setSelectedGroupId('');
  }, []);

  const chatLinkHandler = useCustomLink('/c/' + lastConversationId, clickCallback);
  const groupsLinkHandler = useCustomLink('/d/groups');

  return (
    <div className="mr-2 mt-2 flex h-10 items-center justify-between">
      <Breadcrumb className="mt-1 px-2 dark:text-gray-200">
        <BreadcrumbList>
          <BreadcrumbItem className="hover:dark:text-white">
            <BreadcrumbLink
              href="/"
              className="flex flex-row items-center gap-1"
              onClick={chatLinkHandler}
            >
              <ArrowLeft className="icon-xs" aria-hidden="true" />
              <span className="hidden md:flex">Back to Chat</span>
              <span className="flex md:hidden">Chat</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem className="hover:dark:text-white">
            <BreadcrumbLink
              href="/d/groups"
              className="flex flex-row items-center gap-1"
              onClick={groupsLinkHandler}
            >
              <Users className="h-4 w-4 dark:text-gray-300" aria-hidden="true" />
              Group Management
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center justify-center gap-2">
        {/* Future: Add group-specific actions here */}
      </div>
    </div>
  );
}