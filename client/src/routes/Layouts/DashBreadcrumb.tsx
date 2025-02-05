import { useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { SystemRoles } from 'librechat-data-provider';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import { ArrowLeft, MessageSquareQuote } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  // BreadcrumbEllipsis,
  // DropdownMenu,
  // DropdownMenuItem,
  // DropdownMenuContent,
  // DropdownMenuTrigger,
} from '~/components/ui';
import { useLocalize, useCustomLink, useAuthContext } from '~/hooks';
import AdvancedSwitch from '~/components/Prompts/AdvancedSwitch';
import { RightPanel } from '../../components/Prompts/RightPanel';
import AdminSettings from '~/components/Prompts/AdminSettings';
import { useDashboardContext } from '~/Providers';
import { PromptsEditorMode } from '~/common';
import store from '~/store';

const promptsPathPattern = /prompts\/(?!new(?:\/|$)).*$/;

const getConversationId = (prevLocationPath: string) => {
  if (!prevLocationPath || prevLocationPath.includes('/d/')) {
    return 'new';
  }
  const lastPathnameParts = prevLocationPath.split('/');
  return lastPathnameParts[lastPathnameParts.length - 1];
};

export default function DashBreadcrumb() {
  const location = useLocation();
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { prevLocationPath } = useDashboardContext();
  const lastConversationId = useMemo(() => getConversationId(prevLocationPath), [prevLocationPath]);

  const setPromptsName = useSetRecoilState(store.promptsName);
  const setPromptsCategory = useSetRecoilState(store.promptsCategory);
  const editorMode = useRecoilValue(store.promptsEditorMode);

  const clickCallback = useCallback(() => {
    setPromptsName('');
    setPromptsCategory('');
  }, [setPromptsName, setPromptsCategory]);

  const chatLinkHandler = useCustomLink('/c/' + lastConversationId, clickCallback);
  const promptsLinkHandler = useCustomLink('/d/prompts');

  const isPromptsPath = useMemo(
    () => promptsPathPattern.test(location.pathname),
    [location.pathname],
  );

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
              <ArrowLeft className="icon-xs" />
              <span className="hidden md:flex">{localize('com_ui_back_to_chat')}</span>
              <span className="flex md:hidden">{localize('com_ui_chat')}</span>
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
      <div className="flex items-center justify-center gap-2">
        {isPromptsPath && <AdvancedSwitch />}
        {user?.role === SystemRoles.ADMIN && <AdminSettings />}
      </div>
    </div>
  );
}
