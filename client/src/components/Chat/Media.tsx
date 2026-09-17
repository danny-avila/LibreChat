import { useCallback, useMemo, useState, lazy, Suspense } from 'react';
import { useSetAtom } from 'jotai';
import { Images } from 'lucide-react';
import { getEndpointFileConfig, isAgentsEndpoint, mergeFileConfig } from 'librechat-data-provider';
import {
  Button,
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogDescription,
} from '@librechat/client';
import type { MediaAsset, TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import useAgentUploadTarget from '~/hooks/Agents/useAgentUploadTarget';
import { MediaHostProvider } from '~/components/Media/host';
import { useMediaChatHandoff } from './useMediaChatHandoff';
import { getViableUploadOptions } from '~/utils/files';
import { useMediaShellHost } from '~/routes/mediaHost';
import { useGetFileConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
const MediaWorkspace = lazy(() => import('~/components/Media/Workspace'));
import { mediaDraftFamily } from '~/components/Media/state';

export default function ChatMedia({
  conversation,
  files,
  setFiles,
  disabled,
  temporary,
}: {
  conversation: TConversation | null;
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  disabled: boolean;
  temporary: boolean;
}) {
  const localize = useLocalize();
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string>();
  const [error, setError] = useState(false);
  const { agentProvider, endpointType, useResponsesApi } = useAgentUploadTarget(conversation);
  const config = useGetFileConfig({ select: (data) => mergeFileConfig(data) });
  const attach = useCallback(
    async (asset: MediaAsset) => {
      const endpoint = isAgentsEndpoint(conversation?.endpoint)
        ? agentProvider
        : conversation?.endpoint;
      if (!config.isSuccess || !endpoint) throw new Error('Destination policy unavailable');
      const policy = getEndpointFileConfig({ fileConfig: config.data, endpoint, endpointType });
      const viable = getViableUploadOptions([new File([], asset.filename, { type: asset.type })], {
        provider: agentProvider,
        endpoint: conversation?.endpoint,
        endpointType,
        useResponsesApi,
        fileSearchEnabled: false,
        codeEnabled: false,
        contextEnabled: false,
        fileSearchAllowedByAgent: false,
        codeAllowedByAgent: false,
        fileConfig: config.data,
        endpointSupportedMimeTypes: policy.supportedMimeTypes,
      });
      const otherFiles = [...files.values()].filter((file) => file.file_id !== asset.file_id);
      if (
        disabled ||
        policy.disabled ||
        !viable.includes(undefined) ||
        (policy.fileLimit && otherFiles.length + 1 > policy.fileLimit) ||
        (policy.fileSizeLimit && asset.bytes >= policy.fileSizeLimit) ||
        (policy.totalSizeLimit &&
          otherFiles.reduce((sum, file) => sum + file.size, asset.bytes) > policy.totalSizeLimit)
      ) {
        throw new Error('Destination cannot accept this file');
      }
      setFiles((previous) =>
        new Map(previous).set(asset.file_id, {
          ...asset,
          size: asset.bytes,
          progress: 1,
          attached: true,
        }),
      );
      setOpen(false);
      setError(false);
    },
    [
      agentProvider,
      conversation?.endpoint,
      config.isSuccess,
      config.data,
      endpointType,
      useResponsesApi,
      files,
      disabled,
      setFiles,
    ],
  );
  const actions = useMemo(
    () => ({ openThread: (id: string) => setThreadId(id || undefined), useInChat: attach }),
    [attach],
  );
  const { host, media } = useMediaShellHost(actions);
  const setDraft = useSetAtom(mediaDraftFamily(`${host?.scope ?? ''}:new`));
  const destination = conversation?.conversationId ?? 'new';
  const { dismiss } = useMediaChatHandoff({
    scope: host?.scope,
    conversationId: destination,
    ready: config.isSuccess,
    isCurrentSession: host?.isCurrentSession,
    attach,
    onError: () => setError(true),
  });
  const references = [...files.values()].filter(
    (file) =>
      file.progress === 1 && file.type?.startsWith('image/') && file.filepath && file.filename,
  );
  if (!host || !media?.chat) return null;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={localize('com_media_create')}
        title={localize('com_media_create')}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Images className="size-5" />
      </Button>
      {error && (
        <div role="alert" className="text-sm">
          <p>{localize('com_media_chat_unsupported')}</p>
          <Button
            variant="ghost"
            onClick={() => {
              dismiss();
              setError(false);
            }}
          >
            {localize('com_ui_dismiss')}
          </Button>
        </div>
      )}
      <OGDialog open={open} onOpenChange={setOpen}>
        <OGDialogContent className="flex h-[90dvh] max-w-6xl flex-col overflow-hidden">
          <OGDialogTitle>{localize('com_media_create')}</OGDialogTitle>
          <OGDialogDescription>{localize('com_media_chat_description')}</OGDialogDescription>
          {temporary ? (
            <p role="status">{localize('com_media_temporary')}</p>
          ) : (
            <>
              {references.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => {
                    const assets: MediaAsset[] = references.map((file) => ({
                      file_id: file.file_id,
                      filename: file.filename!,
                      filepath: file.filepath!,
                      type: file.type!,
                      bytes: file.size,
                      width: file.width,
                      height: file.height,
                    }));
                    setDraft((previous) => ({
                      ...previous,
                      revision: previous.revision + 1,
                      operation: 'image.edit',
                      assets,
                      inputs: assets.map((asset) => ({
                        role: 'reference',
                        file_id: asset.file_id,
                      })),
                    }));
                    setThreadId(undefined);
                  }}
                >
                  {localize('com_media_edit_attachments')}
                </Button>
              )}
              <MediaHostProvider value={host}>
                <Suspense fallback={<p role="status">{localize('com_media_loading')}</p>}>
                  <MediaWorkspace threadId={threadId} />
                </Suspense>
              </MediaHostProvider>
            </>
          )}
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
