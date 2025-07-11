import { atom } from 'jotai';
import { atomWithReset, RESET } from 'jotai/utils';
import { logger } from '~/utils';
import type { Artifact } from '~/common';

const artifactsStateBase = atomWithReset<Record<string, Artifact | undefined> | null>(null);
export const artifactsState = atom(
  (get) => get(artifactsStateBase),
  (get, set, newValue: Record<string, Artifact | undefined> | null | typeof RESET) => {
    set(artifactsStateBase, newValue);
    if (newValue !== RESET) {
      logger.log('artifacts', 'Jotai Effect: Setting artifactsState', {
        key: 'artifactsState',
        newValue,
      });
    }
  },
);

const currentArtifactIdBase = atomWithReset<string | null>(null);
export const currentArtifactId = atom(
  (get) => get(currentArtifactIdBase),
  (get, set, newValue: string | null | typeof RESET) => {
    set(currentArtifactIdBase, newValue);
    if (newValue !== RESET) {
      logger.log('artifacts', 'Jotai Effect: Setting currentArtifactId', {
        key: 'currentArtifactId',
        newValue,
      });
    }
  },
);

const artifactsVisibilityBase = atom<boolean>(true);
export const artifactsVisibility = atom(
  (get) => get(artifactsVisibilityBase),
  (get, set, newValue: boolean) => {
    set(artifactsVisibilityBase, newValue);
    logger.log('artifacts', 'Jotai Effect: Setting artifactsVisibility', {
      key: 'artifactsVisibility',
      newValue,
    });
  },
);

const visibleArtifactsBase = atomWithReset<Record<string, Artifact | undefined> | null>(null);
export const visibleArtifacts = atom(
  (get) => get(visibleArtifactsBase),
  (get, set, newValue: Record<string, Artifact | undefined> | null | typeof RESET) => {
    set(visibleArtifactsBase, newValue);
    if (newValue !== RESET) {
      logger.log('artifacts', 'Jotai Effect: Setting `visibleArtifacts`', {
        key: 'visibleArtifacts',
        newValue,
      });
    }
  },
);
