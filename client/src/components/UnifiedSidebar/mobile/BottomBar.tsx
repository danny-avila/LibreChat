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
function BottomBar({
  links,
  onNewChat,
}: {
  links: NavLink[];
  onNewChat: (afterSlide?: () => void) => void;
}) {
  const localize = useLocalize();
  const search = useRecoilValue(store.search);
  const switchToHistory = useRecoilValue(store.newChatSwitchToHistory);
  const { active, setActive } = useActivePanel();

  const { startNewChat } = useNewChat();

  /**
   * Close first, reset second — inverted from `useNewChat`'s own click
   * handler: `startNewChat` clears the message cache and resets the
   * conversation, and run synchronously that commit stalls the drawer
   * slide's first frame on large conversations. The reset (and the panel
   * switch-back) ride the close's `afterSlide` instead, landing mid-slide.
   * The modified-click guard mirrors `useNewChat.handleNewChatClick` so a
   * ctrl/middle click still opens `/c/new` in a new tab.
   */
  const handleNewChatClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }
      event.preventDefault();
      onNewChat(() => {
        if (switchToHistory) {
          setActive(DEFAULT_PANEL);
        }
        startNewChat();
      });
    },
    [onNewChat, switchToHistory, setActive, startNewChat],
  );
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
