import { useMemo } from 'react';

import { MessageCircleDashed } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { Constants, getConfigDefaults } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { Switch } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import store from '~/store';

export const TemporaryChat = () => {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const defaultInterface = getConfigDefaults().interface;
  const [isTemporary, setIsTemporary] = useRecoilState(store.isTemporary);
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const conversationId = conversation?.conversationId ?? '';
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  if (interfaceConfig.temporaryChat === false) {
    return null;
  }

  const isActiveConvo = Boolean(
    conversation &&
      conversationId &&
      conversationId !== Constants.NEW_CONVO &&
      conversationId !== 'search',
  );

  const onClick = () => {
    if (isActiveConvo) {
      return;
    }
    setIsTemporary(!isTemporary);
  };

  return (
    <div className="sticky bottom-0 border-none bg-surface-tertiary px-6 py-4 ">
      <div className="flex items-center">
        <div className={cn('flex flex-1 items-center gap-2', isActiveConvo && 'opacity-40')}>
          <MessageCircleDashed className="icon-sm" />
          <span className="text-sm text-text-primary">{localize('com_ui_temporary_chat')}</span>
        </div>
        <div className="ml-auto flex items-center">
          <Switch
            id="temporary-chat-switch"
            checked={isTemporary}
            onCheckedChange={onClick}
            disabled={isActiveConvo}
            className="ml-4"
            aria-label="Toggle temporary chat"
            data-testid="temporary-chat-switch"
          />
        </div>
      </div>
    </div>
  );
};
