import { useMemo } from 'react';
import { SquareSlash } from 'lucide-react';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import PromptDetailHeader from './PromptDetailHeader';
import PromptMetadata from './PromptMetadata';
import PromptTextCard from './PromptTextCard';
import PromptVariables from './PromptVariables';
import PromptActions from './PromptActions';

interface PromptDetailsProps {
  group?: TPromptGroup;
  showActions?: boolean;
  onUsePrompt?: () => void;
}

const PromptDetails = ({ group, showActions = true, onUsePrompt }: PromptDetailsProps) => {
  const localize = useLocalize();
  const { user } = useAuthContext();

  const mainText = useMemo(() => {
    const initialText = group?.productionPrompt?.prompt ?? '';
    return replaceSpecialVars({ text: initialText, user });
  }, [group?.productionPrompt?.prompt, user]);

  if (!group) {
    return null;
  }

  return (
    <article
      className="flex flex-col gap-6 p-2"
      aria-label={localize('com_ui_prompt_details', { name: group.name })}
    >
      <PromptDetailHeader group={group} />

      <PromptMetadata group={group} />

      <PromptTextCard group={group} />

      <PromptVariables promptText={mainText} showInfo={false} />

      {group.command && (
        <div className="flex items-center gap-2 rounded-xl border border-border-light bg-surface-secondary p-4">
          <SquareSlash className="h-5 w-5 text-text-secondary" aria-hidden="true" />
          <span className="font-mono text-text-primary">/{group.command}</span>
        </div>
      )}

      {showActions && <PromptActions group={group} onUsePrompt={onUsePrompt} />}
    </article>
  );
};

export default PromptDetails;
