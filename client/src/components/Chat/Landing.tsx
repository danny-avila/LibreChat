import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { easings } from '@react-spring/web';
import { EModelEndpoint } from 'librechat-data-provider';
import { BirthdayIcon, TooltipAnchor, SplitText } from '@librechat/client';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import { useLocalize, useAuthContext, useSelectAgent } from '~/hooks';
import { getIconEndpoint, getEntity, cn } from '~/utils';
import { useSubmitMessage } from '~/hooks';
import { useChatFormContext } from '~/Providers';
import { shouldShowAgentButtons, shouldAutoSelectFirstAgent } from '~/config/agentDefaults';

const containerClassName =
  'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white dark:bg-presentation dark:text-white text-black dark:after:shadow-none ';

function getAvatarUrl(avatar?: { filepath?: string; source?: string }) {
  if (!avatar?.filepath) return undefined;
  return avatar.filepath;
}

function getTextSizeClass(text: string | undefined | null) {
  if (!text) {
    return 'text-xl sm:text-2xl';
  }

  if (text.length < 40) {
    return 'text-2xl sm:text-4xl';
  }

  if (text.length < 70) {
    return 'text-xl sm:text-2xl';
  }

  return 'text-lg sm:text-md';
}

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const methods = useChatFormContext();
  const { submitMessage } = useSubmitMessage();
  const { onSelect: onSelectAgent } = useSelectAgent();

  const [textHasMultipleLines, setTextHasMultipleLines] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const [hasAutoSelectedAgent, setHasAutoSelectedAgent] = useState(false);

  // Auto-select first agent on first page visit/login
  useEffect(() => {
    if (
      !shouldAutoSelectFirstAgent() ||
      hasAutoSelectedAgent ||
      !shouldShowAgentButtons() ||
      !agentsMap ||
      Object.keys(agentsMap).length === 0 ||
      conversation?.agent_id // Don't auto-select if an agent is already selected
    ) {
      return;
    }

    const firstAgent = Object.values(agentsMap)[0] as any;
    if (firstAgent?.id) {
      onSelectAgent(firstAgent.id);
      setHasAutoSelectedAgent(true);
    }
  }, [agentsMap, conversation?.agent_id, hasAutoSelectedAgent, onSelectAgent]);

  const handleSendQuestion = (text: string) => {
    methods.setValue('text', text);
    submitMessage({ text });
  };

  const handleSelectAgent = (agent_id: string | undefined) => {
    if (agent_id) {
      onSelectAgent(agent_id);
    }
  };

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const name = entity?.name ?? '';
  const description = (entity?.description || conversation?.greeting) ?? '';

  const getGreeting = useCallback(() => {
    if (typeof startupConfig?.interface?.customWelcome === 'string') {
      const customWelcome = startupConfig.interface.customWelcome;
      // Replace {{user.name}} with actual user name if available
      if (user?.name && customWelcome.includes('{{user.name}}')) {
        return customWelcome.replace(/{{user.name}}/g, user.name);
      }
      return customWelcome;
    }

    const now = new Date();
    const hours = now.getHours();

    const dayOfWeek = now.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    // Early morning (midnight to 4:59 AM)
    if (hours >= 0 && hours < 5) {
      return localize('com_ui_late_night');
    }
    // Morning (6 AM to 11:59 AM)
    else if (hours < 12) {
      if (isWeekend) {
        return localize('com_ui_weekend_morning');
      }
      return localize('com_ui_good_morning');
    }
    // Afternoon (12 PM to 4:59 PM)
    else if (hours < 17) {
      return localize('com_ui_good_afternoon');
    }
    // Evening (5 PM to 8:59 PM)
    else {
      return localize('com_ui_good_evening');
    }
  }, [localize, startupConfig?.interface?.customWelcome, user?.name]);

  const handleLineCountChange = useCallback((count: number) => {
    setTextHasMultipleLines(count > 1);
    setLineCount(count);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [lineCount, description]);

  const getDynamicMargin = useMemo(() => {
    let margin = 'mb-0';

    if (lineCount > 2 || (description && description.length > 100)) {
      margin = 'mb-10';
    } else if (lineCount > 1 || (description && description.length > 0)) {
      margin = 'mb-6';
    } else if (textHasMultipleLines) {
      margin = 'mb-4';
    }

    if (contentHeight > 200) {
      margin = 'mb-16';
    } else if (contentHeight > 150) {
      margin = 'mb-12';
    }

    return margin;
  }, [lineCount, description, textHasMultipleLines, contentHeight]);

  const greetingText =
    typeof startupConfig?.interface?.customWelcome === 'string'
      ? getGreeting()
      : getGreeting() + (user?.name ? ', ' + user.name : '');

  const renderAgentsList = () => {
    // Check if agent buttons should be shown
    if (!shouldShowAgentButtons() || !agentsMap || Object.keys(agentsMap).length === 0) {
      return null;
    }

    return (
      <div className="mb-5 flex flex-wrap justify-center gap-3">
        {Object.values(agentsMap).map((agent: any) => (
          <button
            key={agent.id || agent.name}
            onClick={(e) => {
              e.preventDefault();
              handleSelectAgent(agent.id);
            }}
            className="flex cursor-pointer items-center gap-3 rounded-full bg-white px-5 py-2 text-gray-800 shadow-md transition-all duration-200 ease-in-out hover:bg-gray-50 hover:shadow-lg active:scale-95 dark:border dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
          >
            {agent.avatar?.filepath ? (
              <img
                src={getAvatarUrl(agent.avatar)}
                alt={agent.name ?? `${agent.id}_avatar`}
                className="h-8 w-8 rounded-full border border-gray-200 object-cover dark:border-gray-600"
              />
            ) : (
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-50 dark:from-blue-900 dark:to-blue-800 text-lg">
                🤖
              </span>
            )}
            <span className="text-base font-medium">{agent.name}</span>
          </button>
        ))}
      </div>
    );
  };

  const renderAgentQuestions = () => {
    const { entity, isAgent } = getEntity({
      endpoint: endpointType,
      agentsMap,
      assistantMap,
      agent_id: conversation?.agent_id,
      assistant_id: conversation?.assistant_id,
    });

    if (!isAgent || !entity) return null;

    const questions = entity.questions;

    return (
      <div
        className={cn(
          'agent-questions mx-6 mb-5 mt-12 max-w-3xl',
          'grid grid-cols-2 gap-4 xl:grid-cols-4',
        )}
      >
        {questions?.map((question, index) => (
          <div
            key={index}
            className={cn(
              'agent-question-item rounded-2xl border px-3 pb-4 pt-3',
              'cursor-pointer shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800',
              'transition-all duration-300 ease-in-out',
              index > 1 ? 'hidden sm:block' : '',
            )}
            onClick={() => handleSendQuestion(question)}
          >
            <div
              className={cn(
                'question-text break-word line-clamp-3 overflow-hidden text-[15px]',
                'text-gray-600 dark:text-white',
              )}
            >
              {question}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mb-20 lg:mb-0">
      <div
        className={`flex transform-gpu flex-col items-center justify-center pb-16 transition-all duration-200 ${centerFormOnLanding ? 'max-h-full sm:max-h-0' : 'max-h-full'} ${getDynamicMargin}`}
      >
        <div ref={contentRef} className="flex flex-col items-center gap-0 p-2">
          <div
            className={`flex ${textHasMultipleLines ? 'flex-col' : 'flex-col md:flex-row'} items-center justify-center gap-2`}
          >
            <div className={`relative size-10 justify-center ${textHasMultipleLines ? 'mb-2' : ''}`}>
              <ConvoIcon
                agentsMap={agentsMap}
                assistantMap={assistantMap}
                conversation={conversation}
                endpointsConfig={endpointsConfig}
                containerClassName={containerClassName}
                context="landing"
                className="h-2/3 w-2/3 text-black dark:text-white"
                size={41}
              />
              {startupConfig?.showBirthdayIcon && (
                <TooltipAnchor
                  className="absolute bottom-[27px] right-2"
                  description={localize('com_ui_happy_birthday')}
                  aria-label={localize('com_ui_happy_birthday')}
                >
                  <BirthdayIcon />
                </TooltipAnchor>
              )}
            </div>
            <div className="flex flex-col items-center gap-0 p-2">
              <SplitText
                text={((isAgent || isAssistant) && name) || name ? name : greetingText}
                className={`${getTextSizeClass(((isAgent || isAssistant) && name) || name ? name : greetingText)} font-medium text-text-primary`}
                delay={50}
                textAlign="center"
                animationFrom={{ opacity: 0, transform: 'translate3d(0,50px,0)' }}
                animationTo={{ opacity: 1, transform: 'translate3d(0,0,0)' }}
                easing={easings.easeOutCubic}
                threshold={0}
                rootMargin="0px"
                onLineCountChange={handleLineCountChange}
              />
            </div>
          </div>
          {description && (
            <div className="animate-fadeIn mt-4 max-w-md text-center text-sm font-normal text-text-primary">
              {description}
            </div>
          )}
        </div>
      </div>
      {renderAgentsList()}
      {renderAgentQuestions()}
    </div>
  );
}
