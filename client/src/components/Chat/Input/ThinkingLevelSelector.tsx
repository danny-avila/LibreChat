import { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import type { TranslationKeys } from '~/hooks/useLocalize';
import { useChatContext } from '~/Providers';
import { useSetIndexOptions } from '~/hooks';
import { cn } from '~/utils';

type ThinkLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

const THINK_LEVELS: ThinkLevel[] = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

const LEVEL_KEYS: Record<ThinkLevel, TranslationKeys> = {
  off: 'com_openclaw_thinking_off',
  minimal: 'com_openclaw_thinking_minimal',
  low: 'com_openclaw_thinking_low',
  medium: 'com_openclaw_thinking_medium',
  high: 'com_openclaw_thinking_high',
  xhigh: 'com_openclaw_thinking_xhigh',
};

function ThinkingLevelSelector() {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const { setOption } = useSetIndexOptions();

  if (conversation?.endpoint !== EModelEndpoint.openclaw) {
    return null;
  }

  const current = (conversation?.customParams?.thinkingLevel as ThinkLevel | undefined) ?? 'medium';

  const handleSelect = (value: string) => {
    setOption('customParams')({ ...(conversation?.customParams ?? {}), thinkingLevel: value });
  };

  const menuStore = Ariakit.useMenuStore({ focusLoop: true });

  return (
    <div className="flex items-center gap-1">
      <span className="text-token-text-tertiary text-xs">
        {localize('com_openclaw_thinking_level')}
      </span>
      <Ariakit.MenuProvider store={menuStore}>
        <Ariakit.MenuButton
          className={cn(
            'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
            'bg-surface-secondary text-text-primary hover:bg-surface-hover',
            'border border-border-medium transition-colors',
          )}
          aria-label={localize('com_openclaw_thinking_level')}
        >
          <span>{localize(LEVEL_KEYS[current])}</span>
          <ChevronDown className="size-3" />
        </Ariakit.MenuButton>

        <Ariakit.Menu
          gutter={4}
          className={cn(
            'z-50 min-w-[100px] rounded-md border border-border-medium bg-surface-primary py-1 shadow-lg',
          )}
        >
          {THINK_LEVELS.map((level) => (
            <Ariakit.MenuItem
              key={level}
              onClick={() => handleSelect(level)}
              className={cn(
                'flex cursor-pointer items-center px-3 py-1.5 text-xs',
                'text-text-primary hover:bg-surface-hover',
                level === current && 'font-semibold',
              )}
            >
              {localize(LEVEL_KEYS[level])}
            </Ariakit.MenuItem>
          ))}
        </Ariakit.Menu>
      </Ariakit.MenuProvider>
    </div>
  );
}

export default memo(ThinkingLevelSelector);
