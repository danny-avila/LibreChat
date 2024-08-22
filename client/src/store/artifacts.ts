import { atom } from 'recoil';
import { logger } from '~/utils';
export interface Artifact {
  identifier?: string;
  title: string;
  type: string;
  content: string;
}

export const artifactsState = atom<Record<string, Artifact>>({
  key: 'artifactsState',
  default: {},
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

export const artifactIdsState = atom<string[]>({
  key: 'artifactIdsState',
  default: [],
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        logger.log('artifacts', 'Recoil Effect: Setting artifactIdsState', {
          key: node.key,
          newValue,
        });
      });
    },
  ] as const,
});
