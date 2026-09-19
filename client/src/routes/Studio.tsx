import { useMemo, useState } from 'react';
import { useRecoilValue } from 'recoil';
import { createPortal } from 'react-dom';
import { useSetAtom, useAtomValue } from 'jotai';
import { SlidersHorizontal } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  Skeleton,
  Alert,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
  TooltipAnchor,
} from '@librechat/client';
import type { MediaAsset } from 'librechat-data-provider';
import { sidebarPortalTarget } from '~/components/UnifiedSidebar/portal';
import { cacheMediaAssets } from '~/data-provider/Media/files';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import useSidebarToggle from '~/hooks/Nav/useSidebarToggle';
import { MediaHostProvider } from '~/components/Media/host';
import useSidebarState from '~/hooks/Nav/useSidebarState';
import MediaWorkspace from '~/components/Media/Workspace';
import { mediaChatHandoff } from './mediaHandoff';
import { useMediaShellHost } from './mediaHost';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function Studio() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [asset, setAsset] = useState<MediaAsset>();
  const setHandoff = useSetAtom(mediaChatHandoff);
  const sidebarTarget = useAtomValue(sidebarPortalTarget);
  const { expanded } = useSidebarState();
  const { toggleSidebar } = useSidebarToggle();
  const actions = useMemo(
    () => ({
      openThread: (id: string) =>
        navigate(id ? `/studio/threads/${encodeURIComponent(id)}` : '/studio'),
      useInChat: async (value: MediaAsset) => setAsset(value),
    }),
    [navigate],
  );
  const { host, media, userId, loading, failed, reload } = useMediaShellHost(actions);
  const handoff = (conversationId: string) => {
    if (!asset || !userId || !host?.isCurrentSession()) return;
    cacheMediaAssets(client, userId, [asset]);
    setHandoff({ scope: host.scope, conversationId, asset });
    setAsset(undefined);
    navigate(`/c/${encodeURIComponent(conversationId)}`);
  };
  if (loading)
    return (
      <div role="status" className="space-y-5 p-6 text-text-primary">
        <h1 className="text-2xl font-semibold">{localize('com_media_studio')}</h1>
        <p className="sr-only">{localize('com_media_loading')}</p>
        <Skeleton className="h-64 motion-reduce:animate-none" />
      </div>
    );
  if (failed)
    return (
      <div className="p-6">
        <Alert variant="error">
          <p>{localize('com_media_load_failed')}</p>
          <Button variant="outline" onClick={() => void reload()}>
            {localize('com_ui_retry')}
          </Button>
        </Alert>
      </div>
    );
  if (!host || !media?.studio)
    return (
      <div role="status" className="p-6 text-text-primary">
        {localize('com_media_unavailable')}
      </div>
    );
  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-presentation">
      <MediaHostProvider value={host}>
        <MediaWorkspace
          threadId={threadId}
          settingsHost={{
            render: (settings) => sidebarTarget && createPortal(settings, sidebarTarget),
            toggle: (
              <TooltipAnchor
                description={localize('com_media_settings')}
                render={
                  <Button
                    size="icon"
                    variant="header-action"
                    className="size-9"
                    aria-label={localize('com_media_settings')}
                    aria-expanded={expanded}
                    onClick={toggleSidebar}
                  >
                    <SlidersHorizontal className="icon-md" aria-hidden="true" />
                  </Button>
                }
              />
            ),
          }}
          navigation={
            <span className="md:hidden">
              <OpenSidebar testId="studio-open-sidebar-button" />
            </span>
          }
        />
      </MediaHostProvider>
      <OGDialog
        open={!!asset}
        onOpenChange={(open) => {
          if (!open) setAsset(undefined);
        }}
      >
        <OGDialogContent>
          <OGDialogTitle>{localize('com_media_use_chat')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_chat_destination')}</OGDialogDescription>
          <div className="flex gap-2">
            {conversation?.conversationId && conversation.conversationId !== 'new' && (
              <Button variant="outline" onClick={() => handoff(conversation.conversationId!)}>
                {localize('com_media_current_chat')}
              </Button>
            )}
            <Button onClick={() => handoff('new')}>{localize('com_media_new_chat')}</Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </div>
  );
}
