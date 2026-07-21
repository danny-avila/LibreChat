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

function appendResponseCopyButton(onClick: () => void) {
  const button = document.createElement('button');
  button.dataset.testid = 'copy-response-button';
  button.addEventListener('click', onClick);
  document.body.appendChild(button);
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

  it('ignores shortcuts while focus is inside an open menu overlay', () => {
    const { getByTestId } = renderHarness();
    const before = getByTestId('sidebar').textContent;
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    const item = document.createElement('button');
    item.setAttribute('role', 'menuitem');
    menu.appendChild(item);
    document.body.appendChild(menu);

    const event = dispatchKey({ key: 's', ctrlKey: true, shiftKey: true }, item);

    expect(event.defaultPrevented).toBe(false);
    expect(getByTestId('sidebar').textContent).toBe(before);
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
  it('copies the last response through the existing message copy button', () => {
    const firstCopy = jest.fn();
    const secondCopy = jest.fn();
    renderHarness();
    appendResponseCopyButton(firstCopy);
    appendResponseCopyButton(secondCopy);

    const event = dispatchKey({ key: ';', ctrlKey: true, shiftKey: true });

    expect(firstCopy).not.toHaveBeenCalled();
    expect(secondCopy).toHaveBeenCalledTimes(1);
    expect(copyMock).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
  });

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

describe('no-op shortcuts', () => {
  it('does not prevent submit shortcut when the send button is unavailable', () => {
    renderHarness();

    const event = dispatchKey({ key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
  });

  it('does not prevent submit shortcut when the send button is disabled', () => {
    renderHarness();
    const button = document.createElement('button');
    button.dataset.testid = 'send-button';
    button.disabled = true;
    document.body.appendChild(button);

    const event = dispatchKey({ key: 'Enter', ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
  });
});

function appendSendButton(): jest.Mock {
  const onClick = jest.fn();
  const button = document.createElement('button');
  button.dataset.testid = 'send-button';
  button.addEventListener('click', onClick);
  document.body.appendChild(button);
  return onClick;
}

function appendMainTextarea(): HTMLTextAreaElement {
  const textarea = document.createElement('textarea');
  textarea.id = 'prompt-textarea';
  document.body.appendChild(textarea);
  return textarea;
}

function bindSubmitMessage(binding: string) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ submitMessage: { mac: binding, other: binding } }),
  );
}

describe('composer submit shortcuts', () => {
  it('defers a custom Alt+Enter submit binding in the composer to the textarea', () => {
    window.localStorage.setItem('enterToSend', 'false');
    bindSubmitMessage('Alt+Enter');
    renderHarness();
    const sendClick = appendSendButton();
    const textarea = appendMainTextarea();

    const event = dispatchKey({ key: 'Enter', altKey: true }, textarea);

    expect(sendClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('defers Ctrl/Cmd+Enter in the composer to the native textarea submit', () => {
    renderHarness();
    const sendClick = appendSendButton();
    const textarea = appendMainTextarea();

    const event = dispatchKey({ key: 'Enter', ctrlKey: true }, textarea);

    expect(sendClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('runs a custom Alt+Enter submit binding outside the composer', () => {
    bindSubmitMessage('Alt+Enter');
    renderHarness();
    const sendClick = appendSendButton();

    const event = dispatchKey({ key: 'Enter', altKey: true });

    expect(sendClick).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
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
