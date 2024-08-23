import React, { useEffect, useCallback, useRef, useState } from 'react';
import throttle from 'lodash/throttle';
import { visit } from 'unist-util-visit';
import { useSetRecoilState } from 'recoil';
import type { Pluggable } from 'unified';
import type { Artifact } from '~/common';
import { artifactsState, artifactIdsState } from '~/store/artifacts';
import CodePreview from './CodePreview';

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Artifact({
  node,
  ...props
}: Artifact & {
  children: React.ReactNode | { props: { children: React.ReactNode } };
  node: unknown;
}) {
  const setArtifacts = useSetRecoilState(artifactsState);
  const setArtifactIds = useSetRecoilState(artifactIdsState);
  const [artifact, setArtifact] = useState<Artifact | null>(null);

  const throttledUpdateRef = useRef(
    throttle((updateFn: () => void) => {
      updateFn();
    }, 25),
  );

  const updateArtifact = useCallback(() => {
    const content = extractContent(props.children);

    if (!content || content.trim() === '') {
      return;
    }

    const title = props.title ?? 'Untitled Artifact';
    const type = props.type ?? 'unknown';
    const identifier = props.identifier ?? 'no-identifier';
    const artifactKey = `${identifier}_${type}_${title}`.replace(/\s+/g, '_').toLowerCase();

    throttledUpdateRef.current(() => {
      const currentArtifact = {
        id: artifactKey,
        identifier,
        title,
        type,
        content,
      };

      setArtifacts((prevArtifacts) => {
        if (
          (prevArtifacts as Record<string, Artifact | undefined>)[artifactKey] &&
          prevArtifacts[artifactKey].content === content
        ) {
          return prevArtifacts;
        }

        return {
          ...prevArtifacts,
          [artifactKey]: currentArtifact,
        };
      });

      setArtifactIds((prevIds) => {
        if (!prevIds.includes(artifactKey)) {
          return [...prevIds, artifactKey];
        }
        return prevIds;
      });

      setArtifact(currentArtifact);
    });
  }, [props.children, props.title, props.type, props.identifier, setArtifacts, setArtifactIds]);

  useEffect(() => {
    updateArtifact();
  }, [updateArtifact]);

  return (
    <>
      <CodePreview artifact={artifact} />
      {/* {props.children} */}
    </>
  );
}

// <div className="artifact">
//   <b>{props.title ?? 'Untitled Artifact'}</b>
//   <p>Type: {props.type ?? 'unknown'}</p>
//   <p>Identifier: {props.identifier ?? 'No identifier'}</p>
//   {props.children as React.ReactNode}
// </div>
