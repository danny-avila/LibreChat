import { useSyncExternalStore } from 'react';
import {
  getStoredOneCodeWorkspace,
  ONECODE_PROJECT_STORAGE_KEY,
  ONECODE_WORKSPACE_CHANGED_EVENT,
} from './project';

function subscribe(onChange: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (
      event.storageArea === window.localStorage &&
      (event.key === ONECODE_PROJECT_STORAGE_KEY || event.key === null)
    ) {
      onChange();
    }
  };
  window.addEventListener(ONECODE_WORKSPACE_CHANGED_EVENT, onChange);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(ONECODE_WORKSPACE_CHANGED_EVENT, onChange);
    window.removeEventListener('storage', onStorage);
  };
}

export function useOneCodeWorkspace(): string {
  return useSyncExternalStore(
    subscribe,
    () => getStoredOneCodeWorkspace(),
    () => '',
  );
}
