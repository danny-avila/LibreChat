// client/src/store/artifacts.ts
import { atom } from 'recoil';
import type { CodeBlock } from '~/common';

export const codeBlocksState = atom<Record<string, CodeBlock>>({
  key: 'codeBlocksState',
  default: {},
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        console.log('Recoil Effect: Setting codeBlocksState', { key: node.key, newValue });
      });
    },
  ] as const,
});

export const codeBlockIdsState = atom<string[]>({
  key: 'codeBlockIdsState',
  default: [],
  effects: [
    ({ onSet, node }) => {
      onSet(async (newValue) => {
        console.log('Recoil Effect: Setting codeBlockIdsState', { key: node.key, newValue });
      });
    },
  ] as const,
});