import { useCallback } from 'react';
import { useToastContext } from '@librechat/client';
import {
  megabyte,
  mergeFileConfig,
  checkOpenAIStorage,
  isAssistantsEndpoint,
  getEndpointFileConfig,
  fileConfig as defaultFileConfig,
} from 'librechat-data-provider';
import type { TFile, TConversation } from 'librechat-data-provider';
import type { ExtendedFile, FileSetter } from '~/common';
import { useGetFileConfig } from '~/data-provider';
import { useFileMapContext } from '~/Providers';
import useLocalize from '~/hooks/useLocalize';
import useUpdateFiles from './useUpdateFiles';

/**
 * Stages an already-uploaded file onto the next message.
 *
 * Every check the endpoint would apply to a fresh upload applies here too: the
 * file exists, but nothing guarantees the endpoint the user has since switched
 * to accepts its storage backend, type or size.
 */
export interface AttachExistingContext {
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  conversation: TConversation | null;
}

/**
 * Given rather than read from the chat context: the palette holds this hook and
 * is mounted for the whole conversation, so subscribing there re-rendered the
 * composer's whole tool catalog every time the context value changed.
 */
export default function useAttachExisting(context: AttachExistingContext): (file: TFile) => void {
  const localize = useLocalize();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { files, setFiles, conversation } = context;
  const { data: fileConfig = null } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const { addFile } = useUpdateFiles(setFiles);

  return useCallback(
    (file: TFile) => {
      /* The palette's recent page is a small, separate request that regularly
         resolves before the unbounded file-map query behind it, so a row can be
         on screen while `fileMap` is still empty. Prefer the shared record when
         it is there and fall back to the row's own, which came from the same
         endpoint; `source` is what tells a real server file apart from one we
         know nothing about. */
      const fileData = fileMap?.[file.file_id] ?? file;

      if (!fileData.source || !conversation?.endpoint) {
        showToast({ message: localize('com_ui_attach_error'), status: 'error' });
        return;
      }

      const endpoint = conversation.endpoint;
      const endpointType = conversation.endpointType;

      const isOpenAIStorage = checkOpenAIStorage(fileData.source);
      const isAssistants = isAssistantsEndpoint(endpoint);

      if (isOpenAIStorage && !isAssistants) {
        showToast({ message: localize('com_ui_attach_error_openai'), status: 'error' });
        return;
      }

      if (!isOpenAIStorage && isAssistants) {
        showToast({ message: localize('com_ui_attach_warn_endpoint'), status: 'warning' });
      }

      const endpointFileConfig = getEndpointFileConfig({ fileConfig, endpoint, endpointType });

      if (endpointFileConfig.disabled === true) {
        showToast({ message: localize('com_ui_attach_error_disabled'), status: 'error' });
        return;
      }

      if (endpointFileConfig.fileLimit && files.size >= endpointFileConfig.fileLimit) {
        showToast({
          message: `${localize('com_ui_attach_error_limit')} ${endpointFileConfig.fileLimit} files (${endpoint})`,
          status: 'error',
        });
        return;
      }

      if (fileData.bytes >= (endpointFileConfig.fileSizeLimit ?? Number.MAX_SAFE_INTEGER)) {
        showToast({
          message: `${localize('com_ui_attach_error_size')} ${
            (endpointFileConfig.fileSizeLimit ?? 0) / megabyte
          } MB (${endpoint})`,
          status: 'error',
        });
        return;
      }

      if (!defaultFileConfig.checkType(file.type, endpointFileConfig.supportedMimeTypes ?? [])) {
        showToast({
          message: `${localize('com_ui_attach_error_type')} ${file.type} (${endpoint})`,
          status: 'error',
        });
        return;
      }

      if (endpointFileConfig.totalSizeLimit) {
        const existing = files.get(fileData.file_id);
        let currentTotalSize = 0;
        for (const staged of files.values()) {
          currentTotalSize += staged.size;
        }
        currentTotalSize -= existing?.size ?? 0;
        if (currentTotalSize + fileData.bytes > endpointFileConfig.totalSizeLimit) {
          showToast({
            message: `${localize('com_ui_attach_error_total_size')} ${endpointFileConfig.totalSizeLimit / megabyte} MB (${endpoint})`,
            status: 'error',
          });
          return;
        }
      }

      addFile({
        progress: 1,
        attached: true,
        file_id: fileData.file_id,
        filepath: fileData.filepath,
        preview: fileData.filepath,
        type: fileData.type,
        height: fileData.height,
        width: fileData.width,
        filename: fileData.filename,
        source: fileData.source,
        size: fileData.bytes,
        metadata: fileData.metadata,
      });
    },
    [addFile, files, fileMap, conversation, localize, showToast, fileConfig],
  );
}
