import { memo, useCallback, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilState, useRecoilValue } from 'recoil';
import Cookies from 'js-cookie';
import { QueryKeys } from 'librechat-data-provider';
import { Skeleton, Sidebar, Button, TooltipAnchor, NewChatIcon } from '@librechat/client';
import type { NavLink } from '~/common';
import { CLOSE_SIDEBAR_ID } from '~/components/Chat/Menus/OpenSidebar';
import { useActivePanel, resolveActivePanel } from '~/Providers';
import { useLocalize, useNewConvo } from '~/hooks';
import { isRTLLanguage } from '~/utils/isRTLLanguage';
import { getSpeechLocale } from '~/utils/getSpeechLocale';
import { clearMessagesCache, cn } from '~/utils';
import store from '~/store';

const AccountSettings = lazy(() => import('~/components/Nav/AccountSettings'));

/** Shows the label of the NEXT language (what clicking will switch TO) */
const getNextLangLabel = (lang: string) => {
  if (lang.startsWith('ar')) {
    return 'Fr';
  }
  if (lang.startsWith('fr')) {
    return 'En';
  }
  return 'ع';
};

const getNextLang = (lang: string) => {
  if (lang.startsWith('ar')) {
    return 'fr-FR';
  }
  if (lang.startsWith('fr')) {
    return 'en-US';
  }
  return 'ar-EG';
};

const LanguageToggleButton = memo(function LanguageToggleButton() {
  const [langcode, setLangcode] = useRecoilState(store.lang);
  const [, setChatDirection] = useRecoilState(store.chatDirection);
  const [, setLanguageSTT] = useRecoilState<string>(store.languageSTT);
  const [, setLanguageTTS] = useRecoilState<string>(store.languageTTS);

  const handleClick = useCallback(() => {
    const next = getNextLang(langcode);
    const direction = isRTLLanguage(next) ? 'RTL' : 'LTR';
    const speechLocale = getSpeechLocale(next);
    setChatDirection(direction);
    setLanguageSTT(speechLocale);
    setLanguageTTS(speechLocale);
    requestAnimationFrame(() => {
      document.documentElement.lang = next;
      document.documentElement.dir = direction.toLowerCase();
    });
    setLangcode(next);
    Cookies.set('lang', next, { expires: 365 });
  }, [langcode, setLangcode, setChatDirection, setLanguageSTT, setLanguageTTS]);

  const nextLangLabel = getNextLangLabel(langcode);
  const nextLangName = langcode.startsWith('ar') ? 'Français' : langcode.startsWith('fr') ? 'English' : 'العربية';

  return (
    <TooltipAnchor
      side="right"
      description={nextLangName}
      render={
        <Button
          size="icon"
          variant="ghost"
          aria-label={`Switch to ${nextLangName}`}
          className="h-9 w-9 rounded-lg text-xs font-bold text-text-secondary"
          onClick={handleClick}
        >
          {nextLangLabel}
        </Button>
      }
    />
  );
});

const NewChatButton = memo(function NewChatButton() {
  const localize = useLocalize();
  const queryClient = useQueryClient();
  const { newConversation } = useNewConvo();
  const conversation = useRecoilValue(store.conversationByIndex(0));

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        return;
      }
      e.preventDefault();
      clearMessagesCache(queryClient, conversation?.conversationId);
      queryClient.invalidateQueries([QueryKeys.messages]);
      newConversation();
    },
    [queryClient, conversation?.conversationId, newConversation],
  );

  return (
    <TooltipAnchor
      side="right"
      description={localize('com_ui_new_chat')}
      render={
        <a
          href="/c/new"
          data-testid="new-chat-button"
          aria-label={localize('com_ui_new_chat')}
          className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
          onClick={handleClick}
        >
          <div className="flex size-6 items-center justify-center rounded-full bg-text-primary">
            <NewChatIcon className="size-3.5 text-white dark:text-black" />
          </div>
        </a>
      }
    />
  );
});

const NavIconButton = memo(function NavIconButton({
  link,
  isActive,
  expanded,
  setActive,
  onExpand,
}: {
  link: NavLink;
  isActive: boolean;
  expanded: boolean;
  setActive: (id: string) => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (link.onClick) {
        link.onClick(e);
        return;
      }
      if (!isActive) {
        setActive(link.id);
      }
      if (!expanded) {
        onExpand?.();
      }
    },
    [link, isActive, setActive, expanded, onExpand],
  );

  return (
    <TooltipAnchor
      description={localize(link.title)}
      side="right"
      render={
        <Button
          size="icon"
          variant="ghost"
          aria-label={localize(link.title)}
          aria-pressed={isActive}
          className={cn(
            'h-9 w-9 rounded-lg',
            isActive ? 'bg-surface-active-alt text-text-primary' : 'text-text-secondary',
          )}
          onClick={handleClick}
        >
          <link.icon className="h-4 w-4" aria-hidden="true" />
        </Button>
      }
    />
  );
});

function ExpandedPanel({
  links,
  expanded = true,
  onCollapse,
  onExpand,
}: {
  links: NavLink[];
  expanded?: boolean;
  onCollapse?: () => void;
  onExpand?: () => void;
}) {
  const localize = useLocalize();
  const { active, setActive } = useActivePanel();
  const effectiveActive = resolveActivePanel(active, links);

  const toggleLabel = expanded ? 'com_nav_close_sidebar' : 'com_nav_open_sidebar';
  const toggleClick = expanded ? onCollapse : onExpand;

  return (
    <div className="flex h-full flex-shrink-0 flex-col gap-2 border-r border-border-light bg-surface-primary-alt px-2 py-2">
      {/* AtlasChat brand icon */}
      <div className="mb-0.5 flex justify-center">
        <div className="atlaschat-brand-strip" title="AtlasChat">
          <svg width="20" height="20" viewBox="0 0 512 512" aria-hidden="true">
            <path
              d="M256,88 L278,174 L355,129 L310,206 L396,228 L310,250 L355,327 L278,282 L256,368 L234,282 L157,327 L202,250 L116,228 L202,206 L157,129 L234,174 Z"
              fill="#E8C84A"
            />
          </svg>
        </div>
      </div>
      <TooltipAnchor
        side="right"
        description={localize(toggleLabel)}
        render={
          <Button
            id={expanded ? CLOSE_SIDEBAR_ID : undefined}
            data-testid={expanded ? 'close-sidebar-button' : 'open-sidebar-button'}
            size="icon"
            variant="ghost"
            aria-label={localize(toggleLabel)}
            aria-expanded={expanded}
            className="h-9 w-9 rounded-lg"
            onClick={toggleClick}
          >
            <Sidebar aria-hidden="true" className="h-5 w-5 text-text-primary" />
          </Button>
        }
      />
      <NewChatButton />
      <div className="flex flex-col gap-1 overflow-y-auto">
        {links.map((link) => (
          <NavIconButton
            key={link.id}
            link={link}
            isActive={link.id === effectiveActive}
            expanded={expanded ?? true}
            setActive={setActive}
            onExpand={onExpand}
          />
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-1">
        <LanguageToggleButton />
        <Suspense fallback={<Skeleton className="h-9 w-9 rounded-lg" />}>
          <AccountSettings collapsed />
        </Suspense>
      </div>
    </div>
  );
}

export default memo(ExpandedPanel);
