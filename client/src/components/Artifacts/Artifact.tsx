import { useEffect, useCallback } from 'react';
import { visit } from 'unist-util-visit';
import { useSetRecoilState } from 'recoil';
import { artifactsState, artifactIdsState } from '~/store/artifacts';
import type { Pluggable } from 'unified';

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

export function Artifact({ node, ...props }) {
  const setArtifacts = useSetRecoilState(artifactsState);
  const setArtifactIds = useSetRecoilState(artifactIdsState);

  const updateArtifact = useCallback(() => {
    const content =
      props.children && typeof props.children === 'string'
        ? props.children
        : props.children?.props?.children || '';

    const title = props.title || 'Untitled Artifact';
    const type = props.type || 'unknown';
    const identifier = props.identifier || 'no-identifier';
    const artifactKey = `${identifier}_${type}_${title}`.replace(/\s+/g, '_').toLowerCase();

    setArtifacts((prevArtifacts) => {
      if (prevArtifacts[artifactKey] && prevArtifacts[artifactKey].content === content) {
        return prevArtifacts;
      }

      return {
        ...prevArtifacts,
        [artifactKey]: {
          id: artifactKey,
          identifier,
          title,
          type,
          content,
        },
      };
    });

    setArtifactIds((prevIds) => {
      if (!prevIds.includes(artifactKey)) {
        return [...prevIds, artifactKey];
      }
      return prevIds;
    });
  }, [props, setArtifacts, setArtifactIds]);

  useEffect(() => {
    updateArtifact();
  }, [updateArtifact]);

  return (
    <div className="artifact">
      <b>{props.title || 'Untitled Artifact'}</b>
      <p>Type: {props.type || 'unknown'}</p>
      <p>Identifier: {props.identifier || 'No identifier'}</p>
      {props.children}
    </div>
  );
}
