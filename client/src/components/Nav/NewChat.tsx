import { useRecoilValue } from 'recoil';
import { QueryKeys } from 'librechat-data-provider';
import { useQueryClient } from '@tanstack/react-query';
import { TooltipAnchor, NewChatIcon, Button } from '@librechat/client';
import { useLocalize, useNewConvo, useBranding } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

export default function NewChat({ className }: { className?: string }) {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const branding = useBranding();

  const clickHandler: React.MouseEventHandler<HTMLButtonElement> = (e) => {
    if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
      window.open('/c/new', '_blank');
      return;
    }
    clearMessagesCache(queryClient, conversation?.conversationId);
    queryClient.invalidateQueries([QueryKeys.messages]);
    newConversation();
  };

  return (
    <div className={cn('flex items-center justify-between', className)}>
      <div className="flex items-center gap-2">
        <img src={branding.logoPath} alt={branding.logoAlt} className="h-8 w-8 rounded-lg" />
        <div className="flex flex-col">
          <span className="text-sm font-bold text-text-primary">{branding.appName}</span>
          {branding.appSubtitle && (
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-secondary">
              {branding.appSubtitle}
            </span>
          )}
        </div>
      </div>
      <TooltipAnchor
        description={localize('com_ui_new_chat')}
        render={
          <Button
            size="icon"
            variant="outline"
            data-testid="nav-new-chat-button"
            aria-label={localize('com_ui_new_chat')}
            className="rounded-full border-none bg-transparent duration-0 hover:bg-surface-active-alt focus-visible:ring-inset focus-visible:ring-black focus-visible:ring-offset-0 dark:focus-visible:ring-white md:rounded-xl"
            onClick={clickHandler}
          >
            <NewChatIcon className="icon-lg text-text-primary" />
          </Button>
        }
      />
    </div>
  );
}
