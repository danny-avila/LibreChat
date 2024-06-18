import { useMemo } from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { ArrowLeft, MessageSquareQuote } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  // BreadcrumbEllipsis,
  DropdownMenu,
  // DropdownMenuItem,
  // DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import { useLocalize, useCustomLink, useAuthContext } from '~/hooks';
import AdminSettings from '~/components/Prompts/AdminSettings';
import { useDashboardContext } from '~/Providers';

const getConversationId = (prevLocationPath: string) => {
  if (!prevLocationPath || prevLocationPath.includes('/d/')) {
    return 'new';
  }
  const lastPathnameParts = prevLocationPath.split('/');
  return lastPathnameParts[lastPathnameParts.length - 1];
};

export default function DashBreadcrumb() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { prevLocationPath } = useDashboardContext();
  const lastConversationId = useMemo(() => getConversationId(prevLocationPath), [prevLocationPath]);
  const chatLinkHandler = useCustomLink('/c/' + lastConversationId);
  const promptsLinkHandler = useCustomLink('/d/prompts');
  return (
    <div className="mr-4 flex items-center justify-between">
      <Breadcrumb className="mt-1 px-2 dark:text-gray-200">
        <BreadcrumbList>
          <BreadcrumbItem className="hover:dark:text-white">
            <BreadcrumbLink
              href="/"
              className="flex flex-row items-center gap-1"
              onClick={chatLinkHandler}
            >
              <ArrowLeft className="icon-xs" />
              {localize('com_ui_back_to_chat')}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          {/*
        <BreadcrumbItem className="hover:dark:text-white">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex cursor-default items-center gap-1">
              <BreadcrumbEllipsis className="h-4 w-4" />
              <BreadcrumbItem className="hover:dark:text-white">
                <span className="text-gray-400">{localize('com_ui_dashboard')}</span>
              </BreadcrumbItem>
              <span className="sr-only">Toggle menu</span>
            </DropdownMenuTrigger>
           <DropdownMenuContent align="start">
              <DropdownMenuItem>Documentation</DropdownMenuItem>
              <DropdownMenuItem>Themes</DropdownMenuItem>
              <DropdownMenuItem>GitHub</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        */}
          <BreadcrumbItem className="hover:dark:text-white">
            <BreadcrumbLink
              href="/d/prompts"
              className="flex flex-row items-center gap-1"
              onClick={promptsLinkHandler}
            >
              <MessageSquareQuote className="h-4 w-4 dark:text-gray-300" />
              {localize('com_ui_prompts')}
            </BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      {user?.role === SystemRoles.ADMIN && <AdminSettings />}
    </div>
  );
}
