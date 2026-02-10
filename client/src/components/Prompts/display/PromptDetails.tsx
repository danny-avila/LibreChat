import { useMemo } from 'react';
import { SquareSlash } from 'lucide-react';
import { replaceSpecialVars } from 'librechat-data-provider';
import type { TPromptGroup } from 'librechat-data-provider';
import { useLocalize, useAuthContext } from '~/hooks';
import PromptDetailHeader from './PromptDetailHeader';
import PromptVariables from './PromptVariables';
import PromptTextCard from './PromptTextCard';
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
      className="flex max-h-[80vh] min-w-0 flex-col gap-3 overflow-hidden p-1 sm:gap-4 sm:p-2"
      aria-label={localize('com_ui_prompt_details', { name: group.name })}
    >
      <PromptDetailHeader group={group} />

      <div className="min-h-0 flex-1">
        <PromptTextCard group={group} />
      </div>

      <PromptVariables promptText={mainText} />

      {group.command && (
        <div className="flex items-center gap-2 rounded-xl border border-border-light bg-surface-secondary p-3">
          <SquareSlash className="h-4 w-4 text-text-secondary" aria-hidden="true" />
          <span className="font-mono text-sm text-text-primary">/{group.command}</span>
        </div>
      )}

      {showActions && <PromptActions group={group} onUsePrompt={onUsePrompt} />}
    </article>
  );
};

export default PromptDetails;
