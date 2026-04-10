/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { useRecoilValue } from 'recoil';
import { AnthropicIcon, OGDialog, OGDialogContent } from '@librechat/client';
import React from 'react';
import { useGetAgentByIdQuery } from '~/data-provider/Agents';
import { getModelInfo } from '~/nj/utils/modelData';
import store from '~/store';

export default function ModelInformationModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const conversationModel = useRecoilValue(store.conversationModelByIndex(0));
  const agentId = useRecoilValue(store.conversationAgentIdByIndex(0));
  const { data: agent } = useGetAgentByIdQuery(agentId, { enabled: conversationModel == null });

  const modelId = conversationModel ?? agent?.model ?? null;
  const modelInfo = getModelInfo(modelId);

  return (
    <OGDialog open={open} onOpenChange={onOpenChange}>
      <OGDialogContent className="flex w-auto flex-col items-center gap-4 px-16 py-12">
        <AnthropicIcon size={64} />
        {modelInfo ? (
          <>
            <p className="text-lg font-semibold">{modelInfo.name}</p>
            <p>Knowledge cutoff: {modelInfo.knowledgeCutoff}</p>
            <p>Released: {modelInfo.released}</p>
          </>
        ) : (
          <>
            <p className="text-lg font-semibold">{modelId ?? 'Unknown model'}</p>
            <p>Model information not available</p>
          </>
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
