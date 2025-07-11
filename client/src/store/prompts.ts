import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { PromptsEditorMode } from '~/common';

// Static atoms without localStorage
const staticAtoms = {
  // `name` filter
  promptsName: atom<string>(''),
  // `category` filter
  promptsCategory: atom<string>(''),
  // `pageNumber` filter
  promptsPageNumber: atom<number>(1),
  // `pageSize` filter
  promptsPageSize: atom<number>(10),
};

// Atoms with localStorage
const localStorageAtoms = {
  autoSendPrompts: atomWithStorage('autoSendPrompts', true),
  alwaysMakeProd: atomWithStorage('alwaysMakeProd', true),
  // Editor mode
  promptsEditorMode: atomWithStorage<PromptsEditorMode>(
    'promptsEditorMode',
    PromptsEditorMode.SIMPLE,
  ),
};

export default { ...staticAtoms, ...localStorageAtoms };
