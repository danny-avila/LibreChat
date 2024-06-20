import { atom } from 'recoil';
import { atomWithLocalStorage } from '~/store/utils';

enum PromptsEditorMode {
  SIMPLE = 'simple',
  ADVANCED = 'advanced',
}

// Static atoms without localStorage
const staticAtoms = {
  // `name` filter
  promptsName: atom<string>({ key: 'promptsName', default: '' }),
  // `category` filter
  promptsCategory: atom<string>({ key: 'promptsCategory', default: '' }),
  // `pageNumber` filter
  promptsPageNumber: atom<number>({ key: 'promptsPageNumber', default: 1 }),
  // `pageSize` filter
  promptsPageSize: atom<number>({ key: 'promptsPageSize', default: 10 }),
};

// Atoms with localStorage
const localStorageAtoms = {
  autoSendPrompts: atomWithLocalStorage('autoSendPrompts', true),
  alwaysMakeProd: atomWithLocalStorage('alwaysMakeProd', true),
  // Editor mode
  promptsEditorMode: atomWithLocalStorage<string>('promptsEditorMode', PromptsEditorMode.SIMPLE),
};

export default { ...staticAtoms, ...localStorageAtoms, PromptsEditorMode };
