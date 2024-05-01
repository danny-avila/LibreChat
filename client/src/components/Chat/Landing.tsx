import { EModelEndpoint } from 'librechat-data-provider';
import { useGetEndpointsQuery, useGetStartupConfig } from 'librechat-data-provider/react-query';
import type { ReactNode } from 'react';
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from '~/components/ui';
import { getEndpointField, getIconEndpoint, getIconKey } from '~/utils';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { icons } from './Menus/Endpoints/Icons';
import { BirthdayIcon } from '~/components/svg';
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

  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointIconURL });
  const Icon = icons[iconKey];

  const assistant = endpoint === EModelEndpoint.assistants && assistantMap?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || '';
  const assistantDesc = (assistant && assistant?.description) || '';
  const avatar = (assistant && (assistant?.metadata?.avatar as string)) || '';

  let className =
    'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black';

  if (assistantName && avatar) {
    className = 'shadow-stroke overflow-hidden rounded-full';
  }

  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <div className="relative h-full">
          <div className="absolute left-0 right-0">{Header && Header}</div>
          <div className="flex h-full flex-col items-center justify-center">
            <div className="relative mb-3 h-[72px] w-[72px]">
              {iconURL && iconURL.includes('http') ? (
                <ConvoIconURL
                  preset={conversation}
                  endpointIconURL={endpointIconURL}
                  assistantName={assistantName}
                  assistantAvatar={avatar}
                  context="landing"
                />
              ) : (
                <div className={className}>
                  {endpoint &&
                    Icon &&
                    Icon({
                      size: 41,
                      context: 'landing',
                      className: 'h-2/3 w-2/3',
                      iconURL: endpointIconURL,
                      assistantName,
                      endpoint,
                      avatar,
                    })}
                </div>
              )}
              <TooltipTrigger>
                {(startupConfig?.showBirthdayIcon ?? false) && (
                  <BirthdayIcon className="absolute bottom-12 right-5" />
                )}
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={115} className="left-[20%]">
                {localize('com_ui_happy_birthday')}
              </TooltipContent>
            </div>
            {assistantName ? (
              <div className="flex flex-col items-center gap-0 p-2">
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
              <div className="mb-5 text-2xl font-medium dark:text-white">
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
