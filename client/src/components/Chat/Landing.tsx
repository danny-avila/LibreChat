import type { ReactNode } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import { EModelEndpoint } from 'librechat-data-provider';
import { icons } from './Menus/Endpoints/Icons';
import { useChatContext } from '~/Providers';
import { useLocalize } from '~/hooks';

export default function Landing({ Header }: { Header?: ReactNode }) {
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { conversation } = useChatContext();
  const localize = useLocalize();
  let { endpoint } = conversation ?? {};
  if (
    endpoint === EModelEndpoint.assistant ||
    endpoint === EModelEndpoint.chatGPTBrowser ||
    endpoint === EModelEndpoint.azureOpenAI ||
    endpoint === EModelEndpoint.gptPlugins
  ) {
    endpoint = EModelEndpoint.openAI;
  }

  const iconKey = endpointsConfig?.[endpoint ?? '']?.type ? 'unknown' : endpoint ?? 'unknown';

  return (
    <div className="relative h-full">
      <div className="absolute left-0 right-0">{Header && Header}</div>
      <div className="flex h-full flex-col items-center justify-center">
        <div className="mb-3 h-[72px] w-[72px]">
          <div className="gizmo-shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black">
            {icons[iconKey]({
              size: 41,
              context: 'landing',
              className: 'h-2/3 w-2/3',
              endpoint: endpoint as EModelEndpoint | string,
              iconURL: endpointsConfig?.[endpoint ?? ''].iconURL,
            })}
          </div>
        </div>
        <div className="mb-5 text-2xl font-medium dark:text-white">
          {localize('com_nav_welcome_message')}
        </div>
      </div>
    </div>
  );
}
