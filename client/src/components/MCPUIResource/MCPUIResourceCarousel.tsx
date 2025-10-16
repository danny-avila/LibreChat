import React, { useMemo } from 'react';
import { useConversationUIResources } from '~/hooks/Messages/useConversationUIResources';
import { useMessagesConversation } from '~/Providers';
import UIResourceCarousel from '../Chat/Messages/Content/UIResourceCarousel';
import type { UIResource } from 'librechat-data-provider';

interface MCPUIResourceCarouselProps {
  node: {
    properties: {
      resourceIds?: string[];
    };
  };
}

/**
 * Component that renders multiple MCP UI resources in a carousel.
 * Works in both main app and share view.
 */
export function MCPUIResourceCarousel(props: MCPUIResourceCarouselProps) {
  const { conversation } = useMessagesConversation();

  const conversationResourceMap = useConversationUIResources(
    conversation?.conversationId ?? undefined,
  );

  const uiResources = useMemo(() => {
    const { resourceIds = [] } = props.node.properties;

    return resourceIds.map((id) => conversationResourceMap.get(id)).filter(Boolean) as UIResource[];
  }, [props.node.properties, conversationResourceMap]);

  if (uiResources.length === 0) {
    return null;
  }

  return <UIResourceCarousel uiResources={uiResources} />;
}
