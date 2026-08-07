import { useRef, useMemo, useCallback } from 'react';
import { useDrop } from 'react-dnd';
import { useRecoilValue } from 'recoil';
import { useToastContext } from '@librechat/client';
import { NativeTypes } from 'react-dnd-html5-backend';
import { useQueryClient } from '@tanstack/react-query';
import {
  QueryKeys,
  mergeFileConfig,
  resolveEndpointType,
  isAssistantsEndpoint,
  getEndpointFileConfig,
} from 'librechat-data-provider';
import type { DropTargetMonitor } from 'react-dnd';
import type * as t from 'librechat-data-provider';
import useFileUploadRouter from './useFileUploadRouter';
import { useUploadModalContext } from '~/Providers';
import useUploadOptions from './useUploadOptions';
import useLocalize from '../useLocalize';
import store from '~/store';

export default function useDragHelpers() {
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();
  const localize = useLocalize();
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;

  const isAssistants = useMemo(
    () => isAssistantsEndpoint(conversation?.endpoint),
    [conversation?.endpoint],
  );

  const { getOptions } = useUploadOptions();
  const routeFiles = useFileUploadRouter();
  const { openModal } = useUploadModalContext();

  /** Use refs to avoid re-creating the drop handler */
  const conversationRef = useRef(conversation);
  const getOptionsRef = useRef(getOptions);
  const routeFilesRef = useRef(routeFiles);
  const openModalRef = useRef(openModal);
  const isAssistantsRef = useRef(isAssistants);

  conversationRef.current = conversation;
  getOptionsRef.current = getOptions;
  routeFilesRef.current = routeFiles;
  openModalRef.current = openModal;
  isAssistantsRef.current = isAssistants;

  const handleDrop = useCallback(
    (item: { files: File[] }) => {
      /** Early block: leverage endpoint file config to prevent drag/drop on disabled endpoints */
      const currentEndpoint = conversationRef.current?.endpoint ?? 'default';
      const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
      const agentId = conversationRef.current?.agent_id;
      const agent = agentId
        ? queryClient.getQueryData<t.Agent>([QueryKeys.agent, agentId])
        : undefined;
      const currentEndpointType = resolveEndpointType(
        endpointsConfig,
        currentEndpoint,
        agent?.provider,
      );
      const cfg = queryClient.getQueryData<t.TFileConfig>([QueryKeys.fileConfig]);
      if (cfg) {
        const endpointCfg = getEndpointFileConfig({
          fileConfig: mergeFileConfig(cfg),
          endpoint: currentEndpoint,
          endpointType: currentEndpointType,
        });
        if (endpointCfg?.disabled === true) {
          showToast({ message: localize('com_ui_attach_error_disabled'), status: 'error' });
          return;
        }
      }

      /** Assistants do not use the upload-option flow */
      if (isAssistantsRef.current) {
        routeFilesRef.current(item.files);
        return;
      }

      const options = getOptionsRef.current(item.files);
      if (options.length === 0) {
        showToast({ message: localize('com_error_files_unsupported'), status: 'error' });
        return;
      }
      if (options.length === 1) {
        routeFilesRef.current(item.files, options[0]);
        return;
      }
      openModalRef.current(item.files);
    },
    [queryClient, showToast, localize],
  );

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop: handleDrop,
      canDrop: () => true,
      collect: (monitor: DropTargetMonitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [handleDrop],
  );

  return { canDrop, isOver, drop };
}
