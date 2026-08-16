import { memo, useCallback } from 'react';
import { useRecoilValue } from 'recoil';
import { SquarePen } from 'lucide-react';
import { Button } from '@librechat/client';
import type { NavLink } from '~/common';
import { useActivePanel, resolveActivePanel, DEFAULT_PANEL } from '~/Providers';
import { useShortcutAriaKey } from '~/hooks/useKeyboardShortcuts';
import SearchBar from '~/components/Nav/SearchBar';
import useNewChat from '~/hooks/Chat/useNewChat';
import { useLocalize } from '~/hooks';
import store from '~/store';

/**
 * Search and new chat are the two most frequent actions in the drawer, and both
 * sat in the top corner — the hardest place to reach one-handed. A flex footer
 * rather than an overlay, so the virtualized list shrinks around it and can
 * never be occluded.
 */
function BottomBar({ links, onNewChat }: { links: NavLink[]; onNewChat: () => void }) {
  const localize = useLocalize();
  const search = useRecoilValue(store.search);
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const { active, setActive } = useActivePanel();

  const handleNewChat = useCallback(() => {
    if (switchToHistory) {
      setActive(DEFAULT_PANEL);
    }
    onNewChat();
  }, [switchToHistory, setActive, onNewChat]);

  const { handleNewChatClick } = useNewChat({ onNewChat: handleNewChat });
  /** The shortcut fires globally; assistive tech needs it discoverable here too. */
  const newChatAriaKey = useShortcutAriaKey('newChat');

  /** Searching messages only means anything from the conversation list. */
  const showSearch = search.enabled === true && resolveActivePanel(active, links) === DEFAULT_PANEL;

  return (
    <div
      className="flex flex-shrink-0 items-center gap-2 px-3 pt-2"
      style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {showSearch && (
        <div className="min-w-0 flex-1">
          <SearchBar isSmallScreen={true} />
        </div>
      )}
      <Button
        asChild
        className={showSearch ? 'h-11 flex-shrink-0 gap-2 rounded-full px-5' : 'h-11 w-full gap-2'}
      >
        <a
          href="/c/new"
          data-testid="nav-new-chat-fab"
          aria-label={localize('com_ui_new_chat')}
          aria-keyshortcuts={newChatAriaKey}
          onClick={handleNewChatClick}
        >
          <SquarePen className="size-5" aria-hidden="true" />
          <span className="text-sm font-medium">{localize('com_ui_new_chat')}</span>
        </a>
      </Button>
    </div>
  );
}

export default memo(BottomBar);
