import { memo, useCallback, useContext, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue } from 'recoil';
import {
  X,
  Sun,
  Moon,
  Image,
  Folder,
  Search,
  Bookmark,
  Telescope,
  SquarePen,
  LayoutGrid,
  MessageCircleHeart,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { QueryKeys } from 'librechat-data-provider';
import { isDark, Button, Skeleton, ThemeContext, TooltipAnchor } from '@librechat/client';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';
import ConversationsSection from './ConversationsSection';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

const FALLBACK_FEEDBACK_HREF = 'mailto:feedback@graupel.chat';

const NavRow = memo(function NavRow({
  icon: Icon,
  label,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'flex h-9 w-full items-center gap-3 rounded-lg px-3 text-sm transition-colors',
        disabled
          ? 'cursor-not-allowed text-text-tertiary'
          : 'text-text-primary hover:bg-surface-hover',
      )}
    >
      <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </button>
  );
});

function SideMenu({ onCollapse }: { onCollapse?: () => void }) {
  const localize = useLocalize();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const { theme, setTheme } = useContext(ThemeContext);
  const { data: startupConfig } = useGetStartupConfig();
  const brand = startupConfig?.appTitle ?? 'LibreChat';
  const dark = isDark(theme);

  const handleNewChat = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConversation();
    },
    [queryClient, conversation?.conversationId, newConversation],
  );

  const handleToggleTheme = useCallback(() => {
    setTheme(dark ? 'light' : 'dark');
  }, [dark, setTheme]);

  const feedbackHref =
    typeof startupConfig?.helpAndFaqURL === 'string' && startupConfig.helpAndFaqURL.length > 1
      ? startupConfig.helpAndFaqURL
      : FALLBACK_FEEDBACK_HREF;

  const handleFeedback = useCallback(() => {
    if (feedbackHref.startsWith('mailto:')) {
      window.location.href = feedbackHref;
      return;
    }
    window.open(feedbackHref, '_blank', 'noopener,noreferrer');
  }, [feedbackHref]);

  return (
    <div className="flex h-full w-full min-w-0 flex-col border-r border-border-light bg-surface-primary-alt">
      <div className="flex h-12 flex-shrink-0 items-center justify-between px-3">
        <span className="truncate text-lg font-semibold text-text-primary">{brand}</span>
        <div className="flex items-center gap-1">
          <TooltipAnchor
            description={localize(dark ? 'com_nav_theme_light' : 'com_nav_theme_dark')}
            side="bottom"
            render={
              <Button
                size="icon"
                variant="ghost"
                aria-label={localize(dark ? 'com_nav_theme_light' : 'com_nav_theme_dark')}
                className="h-8 w-8 rounded-lg text-text-secondary"
                onClick={handleToggleTheme}
              >
                {dark ? (
                  <Sun className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Moon className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            }
          />
          {onCollapse && (
            <TooltipAnchor
              description={localize('com_nav_close_sidebar')}
              side="bottom"
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={localize('com_nav_close_sidebar')}
                  className="h-8 w-8 rounded-lg text-text-secondary"
                  onClick={onCollapse}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              }
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 px-2 pb-1">
        <NavRow icon={SquarePen} label={localize('com_ui_new_chat')} onClick={handleNewChat} />
        <NavRow
          icon={Search}
          label={localize('com_ui_search')}
          onClick={() => navigate('/search')}
        />
        <NavRow
          icon={Folder}
          label={localize('com_ui_projects')}
          onClick={() => navigate('/projects')}
        />
        <NavRow
          icon={Bookmark}
          label={localize('com_ui_bookmarks')}
          onClick={() => navigate('/bookmarks')}
        />
        <NavRow
          icon={Image}
          label={localize('com_ui_images')}
          onClick={() => navigate('/images')}
        />
        <NavRow
          icon={LayoutGrid}
          label={localize('com_ui_apps')}
          onClick={() => navigate('/agents')}
        />
        <NavRow
          icon={Telescope}
          label={localize('com_ui_deep_research')}
          onClick={() => navigate('/c/new')}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pt-2">
        <ConversationsSection />
      </div>

      <div className="flex flex-shrink-0 flex-col gap-1 border-t border-border-light px-2 pb-2 pt-2">
        <button
          type="button"
          onClick={handleFeedback}
          className="text-text-link flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-surface-tertiary text-sm font-medium transition-colors hover:bg-surface-hover"
        >
          <MessageCircleHeart className="h-4 w-4" aria-hidden="true" />
          {localize('com_nav_share_feedback')}
        </button>
        <Suspense fallback={<Skeleton className="h-12 w-full rounded-xl" />}>
          <AccountSettings />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(SideMenu);
