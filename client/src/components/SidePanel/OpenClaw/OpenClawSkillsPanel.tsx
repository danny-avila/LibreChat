import { memo } from 'react';
import { Zap } from 'lucide-react';
import { Spinner } from '@librechat/client';
import { EModelEndpoint } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useChatContext, useChatFormContext } from '~/Providers';
import { useOpenClawSkillsQuery } from '~/data-provider';
import { cn } from '~/utils';

function OpenClawSkillsPanel() {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const methods = useChatFormContext();
  const { data: skills, isLoading } = useOpenClawSkillsQuery();

  if (conversation?.endpoint !== EModelEndpoint.openclaw) {
    return null;
  }

  const insertSkill = (skillName: string) => {
    const current = methods.getValues('text') ?? '';
    const separator = current && !current.endsWith(' ') ? ' ' : '';
    methods.setValue('text', `${current}${separator}/${skillName}`, { shouldValidate: true });
  };

  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
        <Zap className="size-4" />
        <span>{localize('com_openclaw_skills')}</span>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-4">
          <Spinner className="size-5" />
        </div>
      )}

      {!isLoading && (!skills || skills.length === 0) && (
        <p className="text-token-text-tertiary py-4 text-center text-xs">
          {localize('com_openclaw_skills_empty')}
        </p>
      )}

      {!isLoading && skills && skills.length > 0 && (
        <ul className="flex flex-col gap-1">
          {skills.map((skill) => (
            <li key={skill.name}>
              <button
                type="button"
                onClick={() => insertSkill(skill.name)}
                title={localize('com_openclaw_insert_skill')}
                className={cn(
                  'flex w-full flex-col rounded-md px-3 py-2 text-left',
                  'bg-surface-secondary hover:bg-surface-hover',
                  'transition-colors',
                )}
              >
                <span className="text-xs font-medium text-text-primary">/{skill.name}</span>
                {skill.description && (
                  <span className="text-token-text-tertiary mt-0.5 text-[11px] leading-snug">
                    {skill.description}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default memo(OpenClawSkillsPanel);
