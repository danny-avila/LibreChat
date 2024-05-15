import { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { ReactNode } from 'react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import { BirthdayIcon } from '~/components/svg';
import { getIconEndpoint, cn } from '~/utils';
import { useLocalize } from '~/hooks';

export default function Landing({ Header }: { Header?: ReactNode }) {
  const { conversation } = useChatContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();

  const localize = useLocalize();

  let { endpoint = '' } = conversation ?? {};
  const { assistant_id = null } = conversation ?? {};

  if (
    endpoint === EModelEndpoint.chatGPTBrowser ||
    endpoint === EModelEndpoint.azureOpenAI ||
    endpoint === EModelEndpoint.gptPlugins
  ) {
    endpoint = EModelEndpoint.openAI;
  }

  const iconURL = conversation?.iconURL;
  endpoint = getIconEndpoint({ endpointsConfig, iconURL, endpoint });

  const assistant = endpoint === EModelEndpoint.assistants && assistantMap?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || '';
  const assistantDesc = (assistant && assistant?.description) || '';
  const avatar = (assistant && (assistant?.metadata?.avatar as string)) || '';

  const containerClassName =
    'relative flex h-full items-center justify-center rounded-full bg-white text-black';

  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <div className="relative h-full">
          <div className="absolute left-0 right-0">{Header && Header}</div>
          <div className="flex h-full flex-col items-center justify-center">
            <div className={cn('relative h-12 w-12')}>
              <ConvoIcon
                conversation={conversation}
                assistantMap={assistantMap}
                endpointsConfig={endpointsConfig}
                containerClassName={containerClassName}
                context="landing"
                className="h-12 w-12 dark:bg-gray-800 dark:text-white"
                size={41}
              />
              <TooltipTrigger>
                {(startupConfig?.showBirthdayIcon ?? false) && (
                  <BirthdayIcon className="absolute bottom-12 right-5" />
                )}
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={115} className="left-[20%]">
                {localize('com_ui_happy_birthday')}
              </TooltipContent>
            </div>
            {/* Examples: mx-3 mt-12 flex max-w-3xl flex-wrap items-stretch justify-center gap-4 */}
            {assistantName ? (
              <div className="mx-3 mt-8 flex flex-col items-center gap-0 p-2">
                <div className="text-center text-2xl font-medium dark:text-white">
                  {assistantName}
                </div>
                <div className="text-token-text-secondary max-w-md text-center text-xl font-normal ">
                  {assistantDesc ? assistantDesc : localize('com_nav_welcome_message')}
                </div>
                {/* <div className="mt-1 flex items-center gap-1 text-token-text-tertiary">
              <div className="text-sm text-token-text-tertiary">By Daniel Avila</div>
            </div> */}
              </div>
            ) : (
              <div className="mx-3 mb-5 mt-8 text-2xl font-medium dark:text-white">
                {endpoint === EModelEndpoint.assistants
                  ? conversation?.greeting ?? localize('com_nav_welcome_assistant')
                  : conversation?.greeting ?? localize('com_nav_welcome_message')}
              </div>
            )}
          </div>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
}
