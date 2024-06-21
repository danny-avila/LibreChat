import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { EModelEndpoint, isAssistantsEndpoint } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useChatContext, useAssistantsMapContext } from '~/Providers';
import { TooltipProvider, Tooltip } from '~/components/ui';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import { getIconEndpoint, cn } from '~/utils';
import Prompts from './Prompts';

export default function Landing({ Header }: { Header?: ReactNode }) {
  const { conversation } = useChatContext();
  const assistantMap = useAssistantsMapContext();
  const { data: endpointsConfig } = useGetEndpointsQuery();

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

  const isAssistant = isAssistantsEndpoint(endpoint);
  const assistant = isAssistant && assistantMap?.[endpoint]?.[assistant_id ?? ''];
  const assistantName = (assistant && assistant?.name) || '';
  const avatar = (assistant && (assistant?.metadata?.avatar as string)) || '';

  const containerClassName =
    'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black';

  return (
    <TooltipProvider delayDuration={50}>
      <Tooltip>
        <div className="relative h-full">
          <div className="absolute left-0 right-0">{Header && Header}</div>
          <div className="flex h-full flex-col items-center justify-center">
            <div className={cn('relative h-12 w-12', assistantName && avatar ? 'mb-0' : 'mb-3')}>
              <ConvoIcon
                conversation={conversation}
                assistantMap={assistantMap}
                endpointsConfig={endpointsConfig}
                containerClassName={containerClassName}
                context="landing"
                className="h-2/3 w-2/3"
                size={41}
              />
            </div>
            <div className="h-3/5">
              <Prompts />
            </div>
          </div>
        </div>
      </Tooltip>
    </TooltipProvider>
  );
}
