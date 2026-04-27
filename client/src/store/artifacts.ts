import { atom, atomFamily } from 'recoil';
import { logger } from '~/utils';
import type { Artifact } from '~/common';

export const artifactsState = atom<Record<string, Artifact | undefined> | null>({
  key: 'artifactsState',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log('artifacts', 'Recoil Effect: Setting artifactsState', {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});

export const currentArtifactId = atom<string | null>({
  key: 'currentArtifactId',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log('artifacts', 'Recoil Effect: Setting currentArtifactId', {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});

export const artifactsVisibility = atom<boolean>({
  key: 'artifactsVisibility',
  default: true,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log('artifacts', 'Recoil Effect: Setting artifactsVisibility', {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});

/**
 * Per-artifact-id claim used by `ToolArtifactCard` to dedup the same file
 * across tool calls / messages. Holds the unique component-instance key
 * of whichever card most recently mounted for that id; cards whose key
 * doesn't match return `null` so the same chip doesn't render twice.
 *
 * Keyed by `artifact.id` (which is `tool-artifact-${file_id}`), so each
 * card subscribes only to its own slice — adding or removing a claim
 * for one artifact never re-renders cards for unrelated artifacts.
 */
export const toolArtifactClaim = atomFamily<string | null, string>({
  key: 'toolArtifactClaim',
  default: null,
});

export const visibleArtifacts = atom<Record<string, Artifact | undefined> | null>({
  key: 'visibleArtifacts',
  default: null,
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log('artifacts', 'Recoil Effect: Setting `visibleArtifacts`', {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});
