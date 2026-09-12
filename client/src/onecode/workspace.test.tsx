import { act, renderHook, waitFor } from '@testing-library/react';
import { clearStoredOneCodeWorkspace, setStoredOneCodeWorkspace } from './project';
import { useOneCodeWorkspace } from './workspace';

describe('useOneCodeWorkspace', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('notifies same-document consumers after setting and clearing a workspace', async () => {
    const first = renderHook(() => useOneCodeWorkspace());
    const second = renderHook(() => useOneCodeWorkspace());

    act(() => {
      setStoredOneCodeWorkspace('/tmp/project-a');
    });
    await waitFor(() => {
      expect(first.result.current).toBe('/tmp/project-a');
      expect(second.result.current).toBe('/tmp/project-a');
    });

    act(() => {
      clearStoredOneCodeWorkspace();
    });
    await waitFor(() => {
      expect(first.result.current).toBe('');
      expect(second.result.current).toBe('');
    });
  });

  it('responds to a storage event for the workspace key and stops after unmount', async () => {
    const hook = renderHook(() => useOneCodeWorkspace());
    window.localStorage.setItem('onecode.workspace', '/tmp/project-b');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'onecode.workspace',
        newValue: '/tmp/project-b',
        storageArea: window.localStorage,
      }));
    });
    await waitFor(() => expect(hook.result.current).toBe('/tmp/project-b'));
    hook.unmount();

    window.localStorage.setItem('onecode.workspace', '/tmp/project-c');
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'onecode.workspace',
        newValue: '/tmp/project-c',
        storageArea: window.localStorage,
      }));
    });
    expect(hook.result.current).toBe('/tmp/project-b');
  });
});
