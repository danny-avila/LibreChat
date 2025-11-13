import { memo, useMemo, useState, useCallback, useContext } from 'react';
import Cookies from 'js-cookie';
import { useRecoilValue, useRecoilState } from 'recoil';
import {
  Spinner,
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandleAlt,
  useMediaQuery,
  ThemeContext,
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTrigger,
  OGDialogHeader,
  OGDialogTitle,
} from '@librechat/client';
import { useParams } from 'react-router-dom';
import type { PointerDownOutsideEvent, FocusOutsideEvent } from '@radix-ui/react-dialog';
import { CalendarDays, Settings } from 'lucide-react';
import { buildTree } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import { useGetSharedMessages } from 'librechat-data-provider/react-query';
import { useLocalize, useDocumentTitle } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import { ShareContext, ArtifactsProvider, EditorProvider } from '~/Providers';
import Artifacts from '~/components/Artifacts/Artifacts';
import { ThemeSelector, LangSelector } from '~/components/Nav/SettingsTabs/General/General';
import MessagesView from './MessagesView';
import Footer from '../Chat/Footer';
import store from '~/store';
import { getLatestText, cn } from '~/utils';
import type { ArtifactsContextValue } from '~/Providers';

const ARTIFACT_PANEL_WIDTH = 420;
const DEFAULT_ARTIFACT_PANEL_SIZE = 32;
const SHARE_ARTIFACT_PANEL_STORAGE_KEY = 'share:artifacts-panel-size';

function SharedView() {
  const localize = useLocalize();
  const { data: config } = useGetStartupConfig();
  const { theme, setTheme } = useContext(ThemeContext);
  const { shareId } = useParams();
  const { data, isLoading } = useGetSharedMessages(shareId ?? '');
  const dataTree = data && buildTree({ messages: data.messages });
  const messagesTree = dataTree?.length === 0 ? null : (dataTree ?? null);

  const artifacts = useRecoilValue(store.artifactsState);
  const artifactsVisibility = useRecoilValue(store.artifactsVisibility);
  const [langcode, setLangcode] = useRecoilState(store.lang);

  // configure document title
  let docTitle = '';
  if (config?.appTitle != null && data?.title != null) {
    docTitle = `${data.title} | ${config.appTitle}`;
  } else {
    docTitle = data?.title ?? config?.appTitle ?? document.title;
  }

  useDocumentTitle(docTitle);

  const artifactsContextValue = useMemo<ArtifactsContextValue | null>(() => {
    if (!data) {
      return null;
    }

    const latestMessage =
      Array.isArray(data.messages) && data.messages.length > 0
        ? data.messages[data.messages.length - 1]
        : null;

    const latestMessageText = latestMessage
      ? getLatestText({
          messageId: latestMessage?.messageId ?? null,
          text: latestMessage?.text ?? null,
          content: latestMessage?.content ?? null,
        } as TMessage)
      : '';

    return {
      isSubmitting: false,
      latestMessageId: latestMessage?.messageId ?? null,
      latestMessageText,
      conversationId: data.conversationId ?? null,
    };
  }, [data]);

  const shouldRenderArtifacts =
    artifactsVisibility === true &&
    artifactsContextValue != null &&
    Object.keys(artifacts ?? {}).length > 0;

  const formattedDate =
    data?.createdAt != null
      ? new Date(data.createdAt).toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : null;

  const handleThemeChange = useCallback(
    (value: string) => {
      setTheme(value);
    },
    [setTheme],
  );

  const handleLangChange = useCallback(
    (value: string) => {
      let userLang = value;
      if (value === 'auto') {
        userLang = navigator.language || navigator.languages[0];
      }

      requestAnimationFrame(() => {
        document.documentElement.lang = userLang;
      });

      setLangcode(userLang);
      Cookies.set('lang', userLang, { expires: 365 });
    },
    [setLangcode],
  );

  const isSmallScreen = useMediaQuery('(max-width: 1023px)');
  const [artifactPanelSize, setArtifactPanelSize] = useState(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_ARTIFACT_PANEL_SIZE;
    }
    const stored = window.localStorage.getItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY);
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : DEFAULT_ARTIFACT_PANEL_SIZE;
  });

  const normalizedArtifactSize = Math.min(60, Math.max(20, artifactPanelSize));

  const handleLayoutChange = (sizes: number[]) => {
    if (sizes.length < 2) {
      return;
    }
    const newSize = sizes[1];
    if (!Number.isFinite(newSize)) {
      return;
    }
    setArtifactPanelSize(newSize);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(SHARE_ARTIFACT_PANEL_STORAGE_KEY, newSize.toString());
    }
  };

  let content: JSX.Element;
  if (isLoading) {
    content = (
      <div className="flex h-screen items-center justify-center">
        <Spinner className="" />
      </div>
    );
  } else if (data && messagesTree && messagesTree.length !== 0) {
    content = (
      <>
        <ShareHeader
          title={data.title}
          formattedDate={formattedDate}
          theme={theme}
          langcode={langcode}
          onThemeChange={handleThemeChange}
          onLangChange={handleLangChange}
          settingsLabel={localize('com_nav_settings')}
        />
        <MessagesView messagesTree={messagesTree} conversationId={data.conversationId} />
      </>
    );
  } else {
    content = (
      <div className="flex h-screen items-center justify-center">
        {localize('com_ui_shared_link_not_found')}
      </div>
    );
  }

  const footer = (
    <div className="w-full border-t-0 pl-0 pt-2 md:w-[calc(100%-.5rem)] md:border-t-0 md:border-transparent md:pl-0 md:pt-0 md:dark:border-transparent">
      <Footer className="relative mx-auto mt-4 flex max-w-[55rem] flex-wrap items-center justify-center gap-2 px-3 pb-4 pt-2 text-center text-xs text-text-secondary" />
    </div>
  );

  const mainContent = (
    <div className="transition-width relative flex h-full w-full flex-1 flex-col items-stretch overflow-hidden pt-0 dark:bg-surface-secondary">
      <div className="flex h-full flex-col text-text-primary" role="presentation">
        {content}
        {footer}
      </div>
    </div>
  );

  const renderDesktopLayout = () => {
    if (!shouldRenderArtifacts || !artifactsContextValue || isSmallScreen) {
      return null;
    }

    return (
      <ResizablePanelGroup
        direction="horizontal"
        className="flex h-full w-full"
        onLayout={handleLayoutChange}
      >
        <ResizablePanel
          defaultSize={100 - normalizedArtifactSize}
          minSize={35}
          order={1}
          id="share-content"
        >
          {mainContent}
        </ResizablePanel>
        <ResizableHandleAlt withHandle className="bg-border-medium text-text-primary" />
        <ResizablePanel
          defaultSize={normalizedArtifactSize}
          minSize={20}
          maxSize={60}
          order={2}
          id="share-artifacts"
        >
          <ShareArtifactsPanel contextValue={artifactsContextValue} />
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  };

  return (
    <ShareContext.Provider value={{ isSharedConvo: true }}>
      <div className="relative flex min-h-screen w-full dark:bg-surface-secondary">
        <main className="relative flex w-full grow overflow-hidden dark:bg-surface-secondary">
          {renderDesktopLayout() ?? mainContent}
        </main>
        {shouldRenderArtifacts && artifactsContextValue && isSmallScreen && (
          <ShareArtifactsOverlay contextValue={artifactsContextValue} />
        )}
      </div>
    </ShareContext.Provider>
  );
}

interface ShareArtifactsOverlayProps {
  contextValue: ArtifactsContextValue;
}

interface ShareHeaderProps {
  title?: string;
  formattedDate: string | null;
  theme: string;
  langcode: string;
  settingsLabel: string;
  onThemeChange: (value: string) => void;
  onLangChange: (value: string) => void;
}

function ShareHeader({
  title,
  formattedDate,
  theme,
  langcode,
  settingsLabel,
  onThemeChange,
  onLangChange,
}: ShareHeaderProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  const handleDialogOutside = useCallback((event: PointerDownOutsideEvent | FocusOutsideEvent) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-dialog-ignore="true"]')) {
      event.preventDefault();
    }
  }, []);

  return (
    <section className="mx-auto w-full px-3 pb-4 pt-6 md:px-5">
      <div className="bg-surface-primary/80 relative mx-auto flex w-full max-w-[60rem] flex-col gap-4 rounded-3xl border border-border-light px-6 py-5 shadow-xl backdrop-blur">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-semibold text-text-primary">{title}</h1>
            {formattedDate && (
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <CalendarDays className="size-4" aria-hidden="true" />
                <span>{formattedDate}</span>
              </div>
            )}
          </div>

          <OGDialog open={settingsOpen} onOpenChange={setSettingsOpen}>
            <OGDialogTrigger asChild>
              <Button
                size={isMobile ? 'icon' : 'default'}
                type="button"
                variant="outline"
                aria-label={settingsLabel}
                className={cn(
                  'rounded-full border-border-medium text-sm text-text-primary transition-colors',
                  isMobile
                    ? 'absolute bottom-4 right-4 justify-center p-0 shadow-lg'
                    : 'gap-2 self-start px-4 py-2',
                )}
              >
                <Settings className="size-4" aria-hidden="true" />
                <span className="hidden md:inline">{settingsLabel}</span>
              </Button>
            </OGDialogTrigger>
            <OGDialogContent
              className="w-11/12 max-w-lg"
              showCloseButton={true}
              onPointerDownOutside={handleDialogOutside}
              onInteractOutside={handleDialogOutside}
            >
              <OGDialogHeader className="text-left">
                <OGDialogTitle>{settingsLabel}</OGDialogTitle>
              </OGDialogHeader>
              <div className="flex flex-col gap-4 pt-2 text-sm">
                <ThemeSelector theme={theme} onChange={onThemeChange} />
                <div className="bg-border-medium/60 h-px w-full" />
                <LangSelector langcode={langcode} onChange={onLangChange} portal={false} />
              </div>
            </OGDialogContent>
          </OGDialog>
        </div>
      </div>
    </section>
  );
}

function ShareArtifactsOverlay({ contextValue }: ShareArtifactsOverlayProps) {
  return (
    <div
      className="fixed inset-y-0 right-0 z-40 flex w-full max-w-full sm:max-w-[480px]"
      role="complementary"
      aria-label="Artifacts panel"
      style={{ maxWidth: `${ARTIFACT_PANEL_WIDTH}px` }}
    >
      <ShareArtifactsPanel contextValue={contextValue} />
    </div>
  );
}

function ShareArtifactsPanel({ contextValue }: ShareArtifactsOverlayProps) {
  return (
    <ArtifactsProvider value={contextValue}>
      <EditorProvider>
        <div className="flex h-full w-full border-l border-border-light bg-surface-primary shadow-2xl">
          <Artifacts />
        </div>
      </EditorProvider>
    </ArtifactsProvider>
  );
}

export default memo(SharedView);
