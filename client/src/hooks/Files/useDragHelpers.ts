import { useState, useMemo } from 'react';
import { useDrop } from 'react-dnd';
import { useRecoilValue } from 'recoil';
import { NativeTypes } from 'react-dnd-html5-backend';
import { useQueryClient } from '@tanstack/react-query';
import {
  Constants,
  QueryKeys,
  EModelEndpoint,
  isAgentsEndpoint,
  isEphemeralAgent,
  AgentCapabilities,
} from 'librechat-data-provider';
import type * as t from 'librechat-data-provider';
import type { DropTargetMonitor } from 'react-dnd';
import useFileHandling from './useFileHandling';
import store, { ephemeralAgentByConvoId } from '~/store';

export default function useDragHelpers() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<File[]>([]);
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const key = useMemo(
    () => conversation?.conversationId ?? Constants.NEW_CONVO,
    [conversation?.conversationId],
  );
  const ephemeralAgent = useRecoilValue(ephemeralAgentByConvoId(key));

  const handleOptionSelect = (toolResource: string | undefined) => {
    handleFiles(draggedFiles, toolResource);
    setShowModal(false);
    setDraggedFiles([]);
  };

  const isAgents = useMemo(
    () =>
      isAgentsEndpoint(conversation?.endpoint) ||
      isEphemeralAgent(conversation?.endpoint, ephemeralAgent),
    [conversation?.endpoint, ephemeralAgent],
  );

  const { handleFiles } = useFileHandling({
    overrideEndpoint: isAgents ? EModelEndpoint.agents : undefined,
  });

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop(item: { files: File[] }) {
        console.log('drop', item.files);
        if (!isAgents) {
          handleFiles(item.files);
          return;
        }

        const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
        const agentsConfig = endpointsConfig?.[EModelEndpoint.agents];
        const codeEnabled =
          agentsConfig?.capabilities?.includes(AgentCapabilities.execute_code) === true;
        const fileSearchEnabled =
          agentsConfig?.capabilities?.includes(AgentCapabilities.file_search) === true;
        if (!codeEnabled && !fileSearchEnabled) {
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
