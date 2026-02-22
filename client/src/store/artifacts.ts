import { atom } from 'recoil';
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
