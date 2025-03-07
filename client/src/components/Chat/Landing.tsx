import { useMemo, useCallback } from 'react';
import { Label } from '@radix-ui/react-dropdown-menu';
import { EModelEndpoint, Constants } from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import {
  useGetAssistantDocsQuery,
  useGetEndpointsQuery,
  useGetStartupConfig,
} from '~/data-provider';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useLocalize, useSubmitMessage, useAuthContext } from '~/hooks';
import { BirthdayIcon, TooltipAnchor } from '~/components';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import { getIconEndpoint, getEntity } from '~/utils';
import ConvoStarter from './ConvoStarter';

const containerClassName =
  'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black';

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (
      [
        // Using deprecated endpoints, but keeping them for now
        EModelEndpoint.chatGPTBrowser,
        EModelEndpoint.azureOpenAI,
        EModelEndpoint.gptPlugins,
      ].includes(ep as EModelEndpoint)
    ) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { data: documentsMap = new Map() } = useGetAssistantDocsQuery(endpointType, {
    select: (data) => new Map(data.map((dbA) => [dbA.assistant_id, dbA])),
  });

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const name = entity?.name ?? '';
  const description = entity?.description ?? '';
  // Not using avatar for now, but keeping the calculation
  const avatarPath = isAgent
    ? ((entity as t.Agent)?.avatar?.filepath ?? '')
    : (((entity as t.Assistant)?.metadata?.avatar as string) ?? '');

  const conversation_starters = useMemo(() => {
    if (entity?.conversation_starters?.length) {
      return entity.conversation_starters;
    }
    if (isAgent) {
      return entity?.conversation_starters ?? [];
    }
    return documentsMap.get(entity?.id ?? '')?.conversation_starters ?? [];
  }, [documentsMap, isAgent, entity]);

  const { submitMessage } = useSubmitMessage();
  const sendConversationStarter = useCallback(
    (text: string) => submitMessage({ text }),
    [submitMessage],
  );

  const getGreeting = useCallback(() => {
    if (typeof startupConfig?.interface?.customWelcome === 'string') {
      return startupConfig.interface.customWelcome;
    }

    const hours = new Date().getHours();

    if (hours < 12) {
      return localize('com_ui_good_morning');
    }
    if (hours < 18) {
      return localize('com_ui_good_afternoon');
    }
    return localize('com_ui_good_evening');
  }, [localize, startupConfig?.interface?.customWelcome]);

  return (
    <div
      className={`flex h-full transform-gpu flex-col items-center justify-center pb-10 transition-all duration-200 ${centerFormOnLanding ? 'max-h-full sm:max-h-0' : 'max-h-full'}`}
    >
      <div className="flex flex-col items-center gap-0 p-2">
        <div className="flex flex-col items-center justify-center gap-4 md:flex-row">
          <div className="relative size-10 justify-center">
            <ConvoIcon
              agentsMap={agentsMap}
              assistantMap={assistantMap}
              conversation={conversation}
              endpointsConfig={endpointsConfig}
              containerClassName={containerClassName}
              context="landing"
              className="h-2/3 w-2/3"
              size={41}
            />
            {startupConfig?.showBirthdayIcon && (
              <TooltipAnchor
                className="absolute bottom-[27px] right-2"
                description={localize('com_ui_happy_birthday')}
              >
                <BirthdayIcon />
              </TooltipAnchor>
            )}
          </div>
          {name ? (
            <div className="flex flex-col items-center gap-0 p-2">
              <div className="text-center text-2xl font-medium dark:text-white">{name}</div>
            </div>
          ) : isAgent || isAssistant ? (
            <div className="text-center text-3xl font-medium text-text-primary">{name}</div>
          ) : (
            <Label className="text-center text-4xl font-medium text-text-primary">
              <span className="inline-block">{getGreeting()},</span>{' '}
              <span className="inline-block">{user?.name ?? 'User'}</span>
            </Label>
          )}
        </div>
        {(isAgent || isAssistant) && description ? (
          <div className="mt-2 max-w-md text-center text-sm font-normal text-text-primary">
            {description}
          </div>
        ) : (
          typeof startupConfig?.interface?.customWelcome === 'string' && (
            <div className="mt-2 max-w-md text-center text-sm font-normal text-text-primary">
              {startupConfig?.interface?.customWelcome}
            </div>
          )
        )}
      </div>
      <div className="mt-8 flex flex-wrap justify-center gap-3 px-4">
        {conversation_starters
          .slice(0, Constants.MAX_CONVO_STARTERS)
          .map((text: string, index: number) => (
            <ConvoStarter
              key={`starter-${index}`}
              text={text}
              onClick={() => sendConversationStarter(text)}
            />
          ))}
      </div>
    </div>
  );
}
