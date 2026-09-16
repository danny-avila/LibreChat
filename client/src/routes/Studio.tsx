import { useMemo, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useRecoilValue } from 'recoil';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { MediaAsset } from 'librechat-data-provider';
import { MediaHostProvider } from '~/components/Media/host';
import MediaWorkspace from '~/components/Media/Workspace';
import { mediaChatHandoff } from './mediaHandoff';
import { useMediaShellHost } from './mediaHost';
import { useLocalize } from '~/hooks';
import store from '~/store';

export default function Studio() {
  const { threadId } = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0));
  const [asset, setAsset] = useState<MediaAsset>();
  const setHandoff = useSetAtom(mediaChatHandoff);
  const actions = useMemo(
    () => ({
      openThread: (id: string) =>
        navigate(id ? `/studio/threads/${encodeURIComponent(id)}` : '/studio'),
      useInChat: async (value: MediaAsset) => setAsset(value),
    }),
    [navigate],
  );
  const { host, media, userId } = useMediaShellHost(actions);
  const handoff = (conversationId: string) => {
    if (!asset || !userId || !host?.isCurrentSession()) return;
    setHandoff({ scope: host.scope, conversationId, asset });
    setAsset(undefined);
    navigate(`/c/${encodeURIComponent(conversationId)}`);
  };
  if (!host || !media?.studio)
    return (
      <div role="status" className="p-6 text-text-primary">
        {localize('com_media_unavailable')}
      </div>
    );
  return (
    <div className="h-full w-full overflow-y-auto">
      <MediaHostProvider value={host}>
        <MediaWorkspace threadId={threadId} />
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
