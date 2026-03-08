import { atom } from 'jotai';

export const isBulkSelectModeAtom = atom<boolean>(false);

export const selectedConvoIdsAtom = atom<Set<string>>(new Set<string>());
