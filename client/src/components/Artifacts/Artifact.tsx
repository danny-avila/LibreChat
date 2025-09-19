import React, { useEffect, useCallback, useRef, useState } from 'react';
import { UIResourceRenderer } from '@mcp-ui/client';
import { useLocation } from 'react-router-dom';
import { Spinner } from '@librechat/client';
import { useSetRecoilState } from 'recoil';
import { visit } from 'unist-util-visit';
import type { Pluggable } from 'unified';
import throttle from 'lodash/throttle';
import { useMessageContext, useArtifactContext, useChatContext } from '~/Providers';
import { logger, extractContent, getLatestText, handleUIAction } from '~/utils';
import UIResourceCarousel from '../Chat/Messages/Content/UIResourceCarousel';
import useSubmitMessage from '~/hooks/Messages/useSubmitMessage';
import { useGetMessagesByConvoId } from '~/data-provider';
import type { Artifact, UIResource } from '~/common';
import { artifactsState } from '~/store/artifacts';
import ArtifactButton from './ArtifactButton';
import { useUIResources } from '~/hooks';

export const artifactPlugin: Pluggable = () => {
  return (tree) => {
    visit(tree, ['textDirective', 'leafDirective', 'containerDirective'], (node, index, parent) => {
      if (node.type === 'textDirective') {
        const replacementText = `:${node.name}`;
        if (parent && Array.isArray(parent.children) && typeof index === 'number') {
          parent.children[index] = {
            type: 'text',
            value: replacementText,
          };
        }
      }
      if (node.name !== 'artifact') {
        return;
      }
      node.data = {
        hName: node.name,
        hProperties: node.attributes,
        ...node.data,
      };
      return node;
    });
  };
};

const defaultTitle = 'untitled';
const defaultType = 'unknown';
const defaultIdentifier = 'lc-no-identifier';

const shouldShowArtifactSidebar = (type: string): boolean => {
  const unsupportedTypes = ['mcp-ui-single', 'mcp-ui-carousel'];
  return !unsupportedTypes.includes(type);
};

// Check if artifact content is complete (has proper closing :::)
const isArtifactComplete = (messageText: string): boolean => {
  if (!messageText) return false;

  const hasStart = messageText.includes(':::artifact');
  const hasEnd = messageText.replace(':::artifact', '').trim().includes(':::');
  return hasStart && hasEnd;
};

export function Artifact({
  node: _node,
  ...props
}: Artifact & {
  children: React.ReactNode | { props: { children: React.ReactNode } };
  node: unknown;
}) {
  const location = useLocation();
  const { messageId } = useMessageContext();
  const { getNextIndex, resetCounter } = useArtifactContext();
  const { submitMessage } = useSubmitMessage();
  const artifactIndex = useRef(getNextIndex(false)).current;
  const { conversation } = useChatContext();
  const { data: messages } = useGetMessagesByConvoId(conversation?.conversationId ?? '', {
    enabled: !!conversation?.conversationId,
  });

  const setArtifacts = useSetRecoilState(artifactsState);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const { getUIResourceById } = useUIResources();

  const throttledUpdateRef = useRef(
    throttle((updateFn: () => void) => {
      updateFn();
    }, 25),
  );

  const message = messages?.find((m) => m.messageId === messageId);
  const messageText = message ? getLatestText(message) : '';

  const updateArtifact = useCallback(() => {
    const content = extractContent(props.children);
    logger.log('artifacts', 'updateArtifact: content.length', content.length);

    const title = props.title ?? defaultTitle;
    const type = props.type ?? defaultType;
    const identifier = props.identifier ?? defaultIdentifier;
    const artifactKey = `${identifier}_${type}_${title}_${messageId}`
      .replace(/\s+/g, '_')
      .toLowerCase();

    throttledUpdateRef.current(() => {
      const now = Date.now();
      if (artifactKey === `${defaultIdentifier}_${defaultType}_${defaultTitle}_${messageId}`) {
        return;
      }

      const currentArtifact: Artifact = {
        id: artifactKey,
        identifier,
        title,
        type,
        content,
        messageId,
        index: artifactIndex,
        lastUpdateTime: now,
      };

      if (!location.pathname.includes('/c/')) {
        return setArtifact(currentArtifact);
      }

      if (shouldShowArtifactSidebar(type)) {
        setArtifacts((prevArtifacts) => {
          if (
            prevArtifacts?.[artifactKey] != null &&
            prevArtifacts[artifactKey]?.content === content
          ) {
            return prevArtifacts;
          }

          return {
            ...prevArtifacts,
            [artifactKey]: currentArtifact,
          };
        });
      }

      setArtifact(currentArtifact);
    });
  }, [
    props.type,
    props.title,
    setArtifacts,
    props.children,
    props.identifier,
    messageId,
    artifactIndex,
    location.pathname,
  ]);

  useEffect(() => {
    resetCounter();
    updateArtifact();
  }, [updateArtifact, resetCounter]);

  if (!isArtifactComplete(messageText)) {
    return (
      <div className="my-4 flex items-center justify-center rounded-lg border border-border-light bg-surface-primary p-8">
        <div className="flex flex-col items-center">
          <Spinner size={24} className="mb-2" />
          <span className="text-sm text-text-secondary">Generating content...</span>
        </div>
      </div>
    );
  }

  if (artifact?.type === 'mcp-ui-single') {
    // Get the UI resource by URI
    const uri = artifact.content?.trim() ?? '';
    const uiResource = getUIResourceById(uri);

    if (!uiResource) {
      return <div className="text-sm text-muted-foreground">?? {artifact.content} ??</div>;
    }
    return (
      <UIResourceRenderer
        resource={uiResource}
        onUIAction={async (result) => handleUIAction(result, submitMessage)}
        htmlProps={{
          autoResizeIframe: { width: true, height: true },
        }}
      />
    );
  }

  if (artifact?.type === 'mcp-ui-carousel') {
    // Parse comma-separated URIs
    const content = artifact.content ?? '';
    const uris = content.split(',').map((uri) => uri.trim());
    const uiResources = uris
      .map((uri) => getUIResourceById(uri))
      .filter((resource): resource is UIResource => resource !== undefined);

    if (uiResources.length === 0) {
      return <div className="text-sm text-muted-foreground">???</div>;
    }
    return <UIResourceCarousel uiResources={uiResources} />;
  }

  return <ArtifactButton artifact={artifact} />;
}
