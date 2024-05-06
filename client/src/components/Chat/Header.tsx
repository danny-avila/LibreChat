import { useMemo, useState } from 'react';
import { useLocation, useOutletContext } from 'react-router-dom';
import { getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { ContextType } from '~/common';
import { EndpointsMenu, ModelSpecsMenu, PresetsMenu, HeaderNewChat } from './Menus';
import HeaderOptions from './Input/HeaderOptions';
import { Download } from 'lucide-react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { ExportModal } from '../Nav';
import { useRecoilValue } from 'recoil';
import store from '~/store';

const defaultInterface = getConfigDefaults().interface;

export default function Header() {
  const localize = useLocalize();
  const location = useLocation();
  const { data: startupConfig } = useGetStartupConfig();
  const { navVisible } = useOutletContext<ContextType>();
  const modelSpecs = useMemo(() => startupConfig?.modelSpecs?.list ?? [], [startupConfig]);
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  const [showExports, setShowExports] = useState(false);

  const activeConvo = useRecoilValue(store.conversationByIndex(0));
  const globalConvo = useRecoilValue(store.conversation) ?? ({} as TConversation);

  let conversation: TConversation | null | undefined;
  if (location.state?.from?.pathname.includes('/chat')) {
    conversation = globalConvo;
  } else {
    conversation = activeConvo;
  }

  const clickHandler = () => {
    if (exportable) {
      setShowExports(true);
    }
  };

  const exportable =
    conversation &&
    conversation.conversationId &&
    conversation.conversationId !== 'new' &&
    conversation.conversationId !== 'search';

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white p-2 font-semibold dark:bg-gray-800 dark:text-white">
      <div className="hide-scrollbar flex items-center gap-2 overflow-x-auto">
        {!navVisible && <HeaderNewChat />}
        {interfaceConfig.endpointsMenu && <EndpointsMenu />}
        {modelSpecs?.length > 0 && <ModelSpecsMenu modelSpecs={modelSpecs} />}
        {<HeaderOptions interfaceConfig={interfaceConfig} />}
        {interfaceConfig.presets && <PresetsMenu />}
      </div>
      {/* Empty div for spacing */}
      <div />
      {exportable && (
        <div className="juice:gap-1 flex gap-2 pr-1">
          <TooltipProvider delayDuration={50}>
            <Tooltip>
              <TooltipTrigger>
                <button
                  className="btn btn-neutral btn-small relative flex h-9 w-9 items-center justify-center whitespace-nowrap rounded-lg"
                  onClick={clickHandler}
                >
                  <div className="flex w-full items-center justify-center gap-2">
                    <Download size={16} />
                  </div>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={5}>
                {localize('com_nav_export_conversation')}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
      {showExports && (
        <ExportModal open={showExports} onOpenChange={setShowExports} conversation={conversation} />
      )}
    </div>
  );
}
