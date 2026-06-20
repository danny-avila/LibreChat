import copy from 'copy-to-clipboard';
import { MemoryRouter } from 'react-router-dom';
import { RecoilRoot, useRecoilValue } from 'recoil';
import { render, act, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { MutableSnapshot } from 'recoil';
import type { ReactNode } from 'react';
import useKeyboardShortcuts, {
  isOverridden,
  effectiveBinding,
  getShortcutDisplay,
  getShortcutAriaKey,
} from './useKeyboardShortcuts';
import store from '~/store';

jest.mock('copy-to-clipboard', () => ({
  __esModule: true,
  default: jest.fn(() => true),
}));

jest.mock('./useNewConvo', () => ({
  __esModule: true,
  default: () => ({ newConversation: jest.fn() }),
}));

const STORAGE_KEY = 'customKeyboardShortcuts';
const copyMock = copy as jest.MockedFunction<typeof copy>;

function buildConversation(conversationId: string, title: string): TConversation {
  return { conversationId, title, endpoint: 'agents' } as TConversation;
}

function dispatchKey(init: KeyboardEventInit, target: EventTarget = document): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

function Harness() {
  useKeyboardShortcuts();
  const deleteTarget = useRecoilValue(store.keyboardDeleteTarget);
  const sidebarExpanded = useRecoilValue(store.sidebarExpanded);
  return (
    <>
      <span data-testid="delete-target">{deleteTarget?.conversationId ?? 'none'}</span>
      <span data-testid="sidebar">{String(sidebarExpanded)}</span>
    </>
  );
}

function renderHarness(conversation?: TConversation, route = '/c/test-convo') {
  const initializeState = (snapshot: MutableSnapshot) => {
    if (conversation) {
      snapshot.set(store.conversationByIndex(0), conversation);
    }
  };
  return render(<Harness />, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={new QueryClient()}>
        <RecoilRoot initializeState={initializeState}>
          <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
        </RecoilRoot>
      </QueryClientProvider>
    ),
  });
}

beforeEach(() => {
  window.localStorage.clear();
  copyMock.mockClear();
});

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
});

function appendCodeBlock(code: string) {
  const turn = document.createElement('div');
  turn.className = 'agent-turn';
  const pre = document.createElement('pre');
  const codeEl = document.createElement('code');
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  turn.appendChild(pre);
  document.body.appendChild(turn);
}

describe('binding resolution helpers', () => {
  it('falls back to the default binding when there is no override', () => {
    const binding = effectiveBinding('newChat');
    expect(binding).toMatchObject({ ctrl: true, shift: true, key: 'O' });
    expect(getShortcutDisplay('newChat')).toBe('Ctrl+Shift+O');
    expect(getShortcutAriaKey('newChat')).toBe('Control+Shift+O');
  });

  it('honors a stored custom binding for the current platform', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ newChat: { mac: 'Meta+Shift+P', other: 'Control+Shift+P' } }),
    );
    expect(effectiveBinding('newChat')).toMatchObject({ ctrl: true, shift: true, key: 'P' });
    expect(getShortcutAriaKey('newChat')).toBe('Control+Shift+P');
  });

  it('treats a null platform override as an unbound shortcut', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ newChat: { mac: null, other: null } }),
    );
    expect(effectiveBinding('newChat')).toBeNull();
    expect(getShortcutDisplay('newChat')).toBe('');
  });

  it('detects whether an override diverges from the default', () => {
    expect(isOverridden('newChat', undefined)).toBe(false);
    expect(isOverridden('newChat', { mac: 'Meta+Shift+O', other: 'Control+Shift+O' })).toBe(false);
    expect(isOverridden('newChat', { mac: null, other: null })).toBe(true);
    expect(isOverridden('newChat', { mac: 'Meta+Shift+P', other: 'Control+Shift+P' })).toBe(true);
  });
});

describe('global shortcut dispatch', () => {
  it('runs the matched action and prevents the native event', () => {
    const { getByTestId } = renderHarness();
    const before = getByTestId('sidebar').textContent;

    const event = dispatchKey({ key: 's', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId('sidebar').textContent).not.toBe(before);
  });

  it('ignores shortcuts while a modal dialog is open', () => {
    renderHarness();
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);

    const event = dispatchKey({ key: 's', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores non-allowed shortcuts while typing in an input', () => {
    renderHarness();
    const input = document.createElement('input');
    document.body.appendChild(input);

    const event = dispatchKey({ key: 's', ctrlKey: true, shiftKey: true }, input);

    expect(event.defaultPrevented).toBe(false);
  });

  it('does not prevent the native event when the action is a no-op', () => {
    renderHarness();

    // focusChat (Shift+Escape) with no chat textarea present is a no-op.
    const event = dispatchKey({ key: 'Escape', shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('focuses the chat input and prevents the event when the textarea exists', () => {
    renderHarness();
    const textarea = document.createElement('textarea');
    textarea.id = 'prompt-textarea';
    document.body.appendChild(textarea);

    const event = dispatchKey({ key: 'Escape', shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(textarea);
  });
});

describe('clipboard shortcuts', () => {
  it('copies the last code block through the clipboard fallback helper', () => {
    renderHarness();
    appendCodeBlock('const x = 1;');

    const event = dispatchKey({ key: 'k', ctrlKey: true, shiftKey: true });

    expect(copyMock).toHaveBeenCalledWith('const x = 1;', { format: 'text/plain' });
    expect(event.defaultPrevented).toBe(true);
  });

  it('does not copy or prevent the event when there is no code to copy', () => {
    renderHarness();

    const event = dispatchKey({ key: 'k', ctrlKey: true, shiftKey: true });

    expect(copyMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});

describe('delete shortcut confirmation', () => {
  it('opens the delete confirmation instead of deleting immediately', () => {
    const conversation = buildConversation('test-convo', 'My Chat');
    const { getByTestId } = renderHarness(conversation, '/c/test-convo');

    const event = dispatchKey({ key: 'Backspace', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(true);
    expect(getByTestId('delete-target').textContent).toBe('test-convo');
  });

  it('is a no-op when the active conversation is not the routed one', () => {
    const conversation = buildConversation('other-convo', 'Other');
    const { getByTestId } = renderHarness(conversation, '/c/test-convo');

    const event = dispatchKey({ key: 'Backspace', ctrlKey: true, shiftKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(getByTestId('delete-target').textContent).toBe('none');
  });
});
