import React, { useEffect, useCallback, useRef, useState } from 'react';
import throttle from 'lodash/throttle';
import { visit } from 'unist-util-visit';
import { useSetRecoilState, useRecoilValue } from 'recoil';
import type { Pluggable } from 'unified';
import type { Artifact } from '~/common';
import { artifactsState, artifactIdsState } from '~/store/artifacts';
import ArtifactButton from './ArtifactButton';
import { logger } from '~/utils';

export const artifactPlugin: Pluggable = () => {
  return (tree) => {
    visit(tree, ['textDirective', 'leafDirective', 'containerDirective'], (node) => {
      node.data = {
        hName: node.name,
        hProperties: node.attributes,
        ...node.data,
      };
      return node;
    });
  };
};

const extractContent = (
  children: React.ReactNode | { props: { children: React.ReactNode } } | string,
): string => {
  if (typeof children === 'string') {
    return children;
  }
  if (React.isValidElement(children)) {
    return extractContent((children.props as { children?: React.ReactNode }).children);
  }
  if (Array.isArray(children)) {
    return children.map(extractContent).join('');
  }
  return '';
};

export function Artifact({
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  node,
  ...props
}: Artifact & {
  children: React.ReactNode | { props: { children: React.ReactNode } };
  node: unknown;
}) {
  const setArtifacts = useSetRecoilState(artifactsState);
  const setArtifactIds = useSetRecoilState(artifactIdsState);
  const currentArtifacts = useRecoilValue(artifactsState);
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  const throttledUpdateRef = useRef(
    throttle((updateFn: () => void) => {
      updateFn();
    }, 25),
  );

  const updateArtifact = useCallback(() => {
    const content = extractContent(props.children);
    logger.log('artifacts', 'updateArtifact: content.length', content.length);

    if (!content || content.trim() === '') {
      return;
    }

    const title = props.title ?? 'Untitled Artifact';
    const type = props.type ?? 'unknown';
    const identifier = props.identifier ?? 'no-identifier';
    const artifactKey = `${identifier}_${type}_${title}`.replace(/\s+/g, '_').toLowerCase();

    throttledUpdateRef.current(() => {
      const now = Date.now();

      const currentArtifact: Artifact = {
        id: artifactKey,
        identifier,
        title,
        type,
        content,
        lastUpdateTime: now,
      };

      setArtifacts((prevArtifacts) => {
        if (prevArtifacts[artifactKey] != null && prevArtifacts[artifactKey].content === content) {
          return prevArtifacts;
        }

        return {
          ...prevArtifacts,
          [artifactKey]: currentArtifact,
        };
      });

      setArtifactIds((prevIds) => {
        if (!prevIds.includes(artifactKey)) {
          const newIds = [...prevIds, artifactKey];
          const definedIds = newIds.filter((id) => currentArtifacts[id] != null);
          return definedIds.sort(
            (a, b) => currentArtifacts[b].lastUpdateTime - currentArtifacts[a].lastUpdateTime,
          );
        }
        return prevIds;
      });

      setArtifact(currentArtifact);
    });
  }, [
    props.children,
    props.title,
    props.type,
    props.identifier,
    setArtifacts,
    setArtifactIds,
    currentArtifacts,
  ]);

  useEffect(() => {
    updateArtifact();
  }, [updateArtifact]);

  return <ArtifactButton artifact={artifact} />;
}
