import { memo } from 'react';
import * as Ariakit from '@ariakit/react';
import { ChevronDown } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useChatContext } from '~/Providers';
import { useOpenClawModelsQuery, useSwitchOpenClawModel } from '~/data-provider';
import { cn } from '~/utils';

function OpenClawModelSwitcher() {
  const localize = useLocalize();
  const { conversation } = useChatContext();
  const { data: models, isLoading } = useOpenClawModelsQuery();
  const switchModel = useSwitchOpenClawModel();

  if (conversation?.endpoint !== EModelEndpoint.openclaw) {
    return null;
  }

  const currentModel = conversation?.model ?? '';
  const sessionKey = conversation?.openclawSessionKey ?? '';

  const handleSelect = (modelId: string) => {
    if (!sessionKey || modelId === currentModel) {
      return;
    }
    switchModel.mutate({ model: modelId, sessionKey });
  };

  const menuStore = Ariakit.useMenuStore({ focusLoop: true });

  return (
    <Ariakit.MenuProvider store={menuStore}>
      <Ariakit.MenuButton
        className={cn(
          'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
          'bg-surface-secondary text-text-primary hover:bg-surface-hover',
          'border border-border-medium transition-colors',
        )}
        aria-label={localize('com_openclaw_model_switcher')}
        disabled={isLoading || !models?.length}
      >
        <span className="max-w-[120px] truncate">
          {isLoading ? localize('com_openclaw_loading') : currentModel || localize('com_ui_model')}
        </span>
        <ChevronDown className="size-3" />
      </Ariakit.MenuButton>

      <Ariakit.Menu
        gutter={4}
        className={cn(
          'z-50 min-w-[160px] rounded-md border border-border-medium bg-surface-primary py-1 shadow-lg',
        )}
      >
        {models?.map((m) => (
          <Ariakit.MenuItem
            key={m.id}
            onClick={() => handleSelect(m.id)}
            className={cn(
              'flex cursor-pointer flex-col px-3 py-1.5 text-xs',
              'text-text-primary hover:bg-surface-hover',
              m.id === currentModel && 'font-semibold',
            )}
          >
            <span>{m.label || m.id}</span>
            {m.provider && (
              <span className="text-token-text-tertiary text-[10px]">{m.provider}</span>
            )}
          </Ariakit.MenuItem>
        ))}
      </Ariakit.Menu>
    </Ariakit.MenuProvider>
  );
}

export default memo(OpenClawModelSwitcher);
