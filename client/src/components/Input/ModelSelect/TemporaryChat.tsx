import { useMemo } from 'react';

import { MessageCircleDashed } from 'lucide-react';
import { useRecoilState, useRecoilValue } from 'recoil';
import { useGetStartupConfig } from 'librechat-data-provider/react-query';
import { Constants, getConfigDefaults } from 'librechat-data-provider';
import temporaryStore from '~/store/temporary';
import { Switch } from '~/components/ui';
import { cn } from '~/utils';
import store from '~/store';

export const TemporaryChat = () => {
  const { data: startupConfig } = useGetStartupConfig();
  const defaultInterface = getConfigDefaults().interface;
  const [isTemporary, setIsTemporary] = useRecoilState(temporaryStore.isTemporary);
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const conversationId = conversation?.conversationId ?? '';
  const interfaceConfig = useMemo(
    () => startupConfig?.interface ?? defaultInterface,
    [startupConfig],
  );

  if (!interfaceConfig.temporaryChat) {
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
    <div className="sticky bottom-0 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-700">
      <div className="flex items-center">
        <div className={cn('flex flex-1 items-center gap-2', isActiveConvo && 'opacity-40')}>
          <MessageCircleDashed className="icon-sm" />
          <span className="text-sm text-gray-700 dark:text-gray-300">Temporary Chat</span>
        </div>
        <div className="ml-auto flex items-center">
          <Switch
            id="enableUserMsgMarkdown"
            checked={isTemporary}
            onCheckedChange={onClick}
            disabled={isActiveConvo}
            className="ml-4"
            data-testid="enableUserMsgMarkdown"
          />
        </div>
      </div>
    </div>
  );
};
