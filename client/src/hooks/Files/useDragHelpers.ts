import { useState, useMemo } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  QueryKeys,
  Constants,
  EModelEndpoint,
  EToolResources,
  AgentCapabilities,
  isAssistantsEndpoint,
  defaultAgentCapabilities,
} from 'librechat-data-provider';
import type { DropTargetMonitor } from 'react-dnd';
import type * as t from 'librechat-data-provider';
import store, { ephemeralAgentByConvoId } from '~/store';
import useFileHandling from './useFileHandling';

export default function useDragHelpers() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<File[]>([]);
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const setEphemeralAgent = useSetRecoilState(
    ephemeralAgentByConvoId(conversation?.conversationId ?? Constants.NEW_CONVO),
  );

  const handleOptionSelect = (toolResource: EToolResources | undefined) => {
    /** File search is not automatically enabled to simulate legacy behavior */
    if (toolResource && toolResource !== EToolResources.file_search) {
      setEphemeralAgent((prev) => ({
        ...prev,
        [toolResource]: true,
      }));
    }
    handleFiles(draggedFiles, toolResource);
    setShowModal(false);
    setDraggedFiles([]);
  };

  const isAssistants = useMemo(
    () => isAssistantsEndpoint(conversation?.endpoint),
    [conversation?.endpoint],
  );

  const { handleFiles } = useFileHandling({
    overrideEndpoint: isAssistants ? undefined : EModelEndpoint.agents,
  });

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop(item: { files: File[] }) {
        console.log('drop', item.files);
        if (isAssistants) {
          handleFiles(item.files);
          return;
        }

        const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
        const agentsConfig = endpointsConfig?.[EModelEndpoint.agents];
        const capabilities = agentsConfig?.capabilities ?? defaultAgentCapabilities;
        const fileSearchEnabled = capabilities.includes(AgentCapabilities.file_search) === true;
        const codeEnabled = capabilities.includes(AgentCapabilities.execute_code) === true;
        const ocrEnabled = capabilities.includes(AgentCapabilities.ocr) === true;
        if (!codeEnabled && !fileSearchEnabled && !ocrEnabled) {
          handleFiles(item.files);
          return;
        }
        setDraggedFiles(item.files);
        setShowModal(true);
      },
      canDrop: () => true,
      collect: (monitor: DropTargetMonitor) => ({
        isOver: monitor.isOver(),
        canDrop: monitor.canDrop(),
      }),
    }),
    [handleFiles],
  );

  return {
    canDrop,
    isOver,
    drop,
    showModal,
    setShowModal,
    draggedFiles,
    handleOptionSelect,
  };
}
