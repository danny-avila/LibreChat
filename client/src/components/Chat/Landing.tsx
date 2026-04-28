/* eslint-disable i18next/no-literal-string */
import { BirthdayIcon, CodeCanBrandIcon, TooltipAnchor } from '@librechat/client';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { getEntity } from '~/utils';

export default function Landing({
  centerFormOnLanding: _centerFormOnLanding,
}: {
  centerFormOnLanding: boolean;
}) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const localize = useLocalize();

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: conversation?.endpoint,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const entityName = entity?.name ?? '';
  const entityDescription = entity?.description || conversation?.greeting || '';
  const showCustomEntity = ((isAgent || isAssistant) && entityName) || entityName;

  return (
    <div className="flex h-full transform-gpu flex-col items-center px-6 pb-4 pt-12 transition-all duration-200 sm:pt-16">
      <div className="flex flex-col items-center gap-0">
        <div className="relative mb-5 inline-block">
          <CodeCanBrandIcon size={72} radius={16} />
          {startupConfig?.showBirthdayIcon && (
            <TooltipAnchor
              className="absolute bottom-[27px] right-2"
              description={localize('com_ui_happy_birthday')}
            >
              <BirthdayIcon />
            </TooltipAnchor>
          )}
        </div>
        {showCustomEntity ? (
          <>
            <h1 className="text-center font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.01em] text-ink-800 dark:text-dm-text">
              {entityName}
            </h1>
            {entityDescription ? (
              <p className="animate-fadeIn mt-3 max-w-[320px] text-center text-[14px] leading-[1.5] text-cc-slate-500 dark:text-dm-text-mute">
                {entityDescription}
              </p>
            ) : null}
          </>
        ) : (
          <>
            {}
            <h1 className="text-center font-serif text-[34px] font-medium leading-[1.1] tracking-[-0.01em] text-ink-800 dark:text-dm-text">
              Ask the Code.
              <br />
              {}
              <span className="dark:text-signal-amber">Get the section.</span>
            </h1>
            {}
            <p className="animate-fadeIn mt-3 max-w-[320px] text-center text-[14px] leading-[1.5] text-cc-slate-500 dark:text-dm-text-mute">
              Plain-English questions, cited answers from the National &amp; Provincial Building
              Codes.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
