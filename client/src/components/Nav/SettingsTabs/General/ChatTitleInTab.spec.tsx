import { RecoilRoot } from 'recoil';
import { MemoryRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryKeys, LocalStorageKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import ChatTitleInTab from './ChatTitleInTab';
import store from '~/store';

jest.mock('../ToggleSwitch', () => ({
  __esModule: true,
  default: ({ onCheckedChange }: { onCheckedChange?: (value: boolean) => void }) => (
    <>
      <button aria-label={String(true)} onClick={() => onCheckedChange?.(true)} />
      <button aria-label={String(false)} onClick={() => onCheckedChange?.(false)} />
    </>
  ),
}));

const createConversation = (conversationId: string, title: string): TConversation =>
  ({ conversationId, title }) as TConversation;

function renderToggle({
  route,
  recoilConversation,
  cachedConversation,
}: {
  route: string;
  recoilConversation?: TConversation;
  cachedConversation?: TConversation;
}) {
  const queryClient = new QueryClient();
  if (cachedConversation) {
    queryClient.setQueryData(
      [QueryKeys.conversation, cachedConversation.conversationId],
      cachedConversation,
    );
  }

  return render(
    <MemoryRouter initialEntries={[route]}>
      <QueryClientProvider client={queryClient}>
        <RecoilRoot
          initializeState={({ set }) => {
            if (recoilConversation) {
              set(store.conversationByIndex(0), recoilConversation);
            }
          }}
        >
          <ChatTitleInTab />
        </RecoilRoot>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

describe('ChatTitleInTab', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(LocalStorageKeys.APP_TITLE, 'LibreChat');
  });

  it('restores the active conversation title from the query cache', () => {
    renderToggle({
      route: '/c/conversation-1',
      recoilConversation: createConversation('conversation-1', 'New Chat'),
      cachedConversation: createConversation('conversation-1', 'Generated title'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'true' }));

    expect(document.title).toBe('Generated title');
  });

  it('falls back to the matching Recoil conversation when the query cache is empty', () => {
    renderToggle({
      route: '/c/conversation-1',
      recoilConversation: createConversation('conversation-1', 'Cached sidebar title'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'true' }));

    expect(document.title).toBe('Cached sidebar title');
  });

  it('preserves page-specific titles outside chat routes', () => {
    document.title = 'Agent Marketplace | LibreChat';
    renderToggle({
      route: '/agents',
      recoilConversation: createConversation('conversation-1', 'Previous chat'),
    });

    fireEvent.click(screen.getByRole('button', { name: 'false' }));

    expect(document.title).toBe('Agent Marketplace | LibreChat');
  });
});
