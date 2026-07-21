import React, { memo } from 'react';
import { Brain } from 'lucide-react';
import { CheckboxButton } from '@librechat/client';
import { defaultAgentCapabilities } from 'librechat-data-provider';
import { useLocalize, useHasMemoryAccess, useAgentCapabilities, useAuthContext } from '~/hooks';
import { useBadgeRowContext } from '~/Providers';

function Memory() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const context = useBadgeRowContext();
  const { toggleState: memoryActive, debouncedChange, isPinned } = context?.memory ?? {};

  const canUseMemory = useHasMemoryAccess();

  const { memoryEnabled } = useAgentCapabilities(
    context?.agentsConfig?.capabilities ?? defaultAgentCapabilities,
  );

  const hasOptedOut = user?.personalization?.memories === false;

  if (!canUseMemory || !memoryEnabled || hasOptedOut) {
    return null;
  }

  return (
    (memoryActive || isPinned) && (
      <CheckboxButton
        className="max-w-fit"
        checked={memoryActive}
        setValue={debouncedChange}
        label={localize('com_ui_memory')}
        isCheckedClassName="border-purple-600/40 bg-purple-500/10 hover:bg-purple-700/10"
        icon={<Brain className="icon-md" aria-hidden="true" />}
      />
    )
  );
}

export default memo(Memory);
