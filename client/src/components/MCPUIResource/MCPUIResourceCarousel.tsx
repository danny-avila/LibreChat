import React, { useMemo } from 'react';
import { useGetMessagesByConvoId } from '~/data-provider';
import { useMessageContext, useChatContext } from '~/Providers';
import UIResourceCarousel from '../Chat/Messages/Content/UIResourceCarousel';
import type { UIResource } from '~/common';

interface MCPUIResourceCarouselProps {
  node: {
    properties: {
      resourceIndices: number[];
    };
  };
}

export function MCPUIResourceCarousel(props: MCPUIResourceCarouselProps) {
  const { messageId } = useMessageContext();
  const { conversation } = useChatContext();
  const { data: messages } = useGetMessagesByConvoId(conversation?.conversationId ?? '', {
    enabled: !!conversation?.conversationId,
  });

  const uiResources = useMemo(() => {
    const { resourceIndices } = props.node.properties;

    const targetMessage = messages?.find((m) => m.messageId === messageId);

    if (!targetMessage?.attachments) {
      return [];
    }

    const allResources: UIResource[] = targetMessage.attachments
      .filter((a) => a.type === 'ui_resources' && a['ui_resources'])
      .flatMap((a) => a['ui_resources'] as UIResource[]);

    const selectedResources: UIResource[] = resourceIndices
      .map((i) => allResources[i])
      .filter(Boolean) as UIResource[];

    return selectedResources;
  }, [props.node.properties, messages, messageId]);

  if (uiResources.length === 0) {
    return null;
  }

  return <UIResourceCarousel uiResources={uiResources} />;
}
