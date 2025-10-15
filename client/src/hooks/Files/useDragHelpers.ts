import { useState, useMemo, useCallback, useRef } from 'react';
import { useDrop } from 'react-dnd';
import { NativeTypes } from 'react-dnd-html5-backend';
import { useQueryClient } from '@tanstack/react-query';
import { useRecoilValue, useSetRecoilState } from 'recoil';
import {
  Tools,
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
import { isEphemeralAgent } from '~/common';

export default function useDragHelpers() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<File[]>([]);
  const conversation = useRecoilValue(store.conversationByIndex(0)) || undefined;
  const setEphemeralAgent = useSetRecoilState(
    ephemeralAgentByConvoId(conversation?.conversationId ?? Constants.NEW_CONVO),
  );

  const isAssistants = useMemo(
    () => isAssistantsEndpoint(conversation?.endpoint),
    [conversation?.endpoint],
  );

  const { handleFiles } = useFileHandling({
    overrideEndpoint: isAssistants ? undefined : EModelEndpoint.agents,
  });

  const handleOptionSelect = useCallback(
    (toolResource: EToolResources | undefined) => {
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
    },
    [draggedFiles, handleFiles, setEphemeralAgent],
  );

  /** Use refs to avoid re-creating the drop handler */
  const handleFilesRef = useRef(handleFiles);
  const conversationRef = useRef(conversation);

  handleFilesRef.current = handleFiles;
  conversationRef.current = conversation;

  const handleDrop = useCallback(
    (item: { files: File[] }) => {
      if (isAssistants) {
        handleFilesRef.current(item.files);
        return;
      }

      const endpointsConfig = queryClient.getQueryData<t.TEndpointsConfig>([QueryKeys.endpoints]);
      const agentsConfig = endpointsConfig?.[EModelEndpoint.agents];
      const capabilities = agentsConfig?.capabilities ?? defaultAgentCapabilities;
      const fileSearchEnabled = capabilities.includes(AgentCapabilities.file_search) === true;
      const codeEnabled = capabilities.includes(AgentCapabilities.execute_code) === true;
      const contextEnabled = capabilities.includes(AgentCapabilities.context) === true;

      /** Get agent permissions at drop time */
      const agentId = conversationRef.current?.agent_id;
      let fileSearchAllowedByAgent = true;
      let codeAllowedByAgent = true;

      if (agentId && !isEphemeralAgent(agentId)) {
        /** Agent data from cache */
        const agent = queryClient.getQueryData<t.Agent>([QueryKeys.agent, agentId]);
        if (agent) {
          const agentTools = agent.tools as string[] | undefined;
          fileSearchAllowedByAgent = agentTools?.includes(Tools.file_search) ?? false;
          codeAllowedByAgent = agentTools?.includes(Tools.execute_code) ?? false;
        } else {
          /** If agent exists but not found, disallow */
          fileSearchAllowedByAgent = false;
          codeAllowedByAgent = false;
        }
      }

      /** Determine if dragged files are all images (enables the base image option) */
      const allImages = item.files.every((f) => f.type?.startsWith('image/'));

      const shouldShowModal =
        allImages ||
        (fileSearchEnabled && fileSearchAllowedByAgent) ||
        (codeEnabled && codeAllowedByAgent) ||
        contextEnabled;

      if (!shouldShowModal) {
        // Fallback: directly handle files without showing modal
        handleFilesRef.current(item.files);
        return;
      }
      setDraggedFiles(item.files);
      setShowModal(true);
    },
    [isAssistants, queryClient],
  );

  const [{ canDrop, isOver }, drop] = useDrop(
    () => ({
      accept: [NativeTypes.FILE],
      drop: handleDrop,
      canDrop: () => true,
      collect: (monitor: DropTargetMonitor) => {
        /** Optimize collect to reduce re-renders */
        const isOver = monitor.isOver();
        const canDrop = monitor.canDrop();
        return { isOver, canDrop };
      },
    }),
    [handleDrop],
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
