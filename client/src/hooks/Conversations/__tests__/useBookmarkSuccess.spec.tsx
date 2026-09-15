import { createElement, useState } from 'react';
import { QueryKeys, dataService } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, render, fireEvent, screen, waitFor } from '@testing-library/react';
import type { TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import { useTagConversationMutation } from '~/data-provider/mutations';
import useBookmarkSuccess from '../useBookmarkSuccess';

jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: {
      ...actual.dataService,
      addTagToConversation: jest.fn(),
      getConversationTags: jest.fn(),
    },
  };
});

const original = {
  conversationId: 'original',
  tags: ['Old'],
  tagIds: ['old-id'],
} as TConversation;

it('updates host state and cache while keeping a late result out of a newly navigated chat', () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData([QueryKeys.conversation, 'original'], original);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () => {
      const [conversation, setConversation] = useState<TConversation | null>(original);
      const onTagsUpdated = useBookmarkSuccess(conversation?.conversationId ?? '', setConversation);
      return { conversation, setConversation, onTagsUpdated };
    },
    { wrapper },
  );
  const originalSuccess = result.current.onTagsUpdated;
  act(() => originalSuccess(['New'], ['new-id']));
  expect(result.current.conversation?.tagIds).toEqual(['new-id']);
  const nextConversation = { ...original, conversationId: 'next', tagIds: [] };
  act(() => result.current.setConversation(nextConversation));
  act(() => originalSuccess(['Late'], ['late-id']));
  expect(result.current.conversation).toBe(nextConversation);
  expect(
    queryClient.getQueryData<TConversation>([QueryKeys.conversation, 'original'])?.tagIds,
  ).toEqual(['late-id']);
});

it('keeps a pending mutation bound to its original conversation across a keyed menu remount', async () => {
  let resolveRequest: (ids: string[]) => void = () => undefined;
  jest.mocked(dataService.addTagToConversation).mockReturnValue(
    new Promise((resolve) => {
      resolveRequest = resolve;
    }),
  );
  jest.mocked(dataService.getConversationTags).mockResolvedValue([]);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData([QueryKeys.conversation, 'original'], original);
  const next = { ...original, conversationId: 'next', tagIds: [] };
  queryClient.setQueryData([QueryKeys.conversation, 'next'], next);

  function Menu({
    conversation,
    onTagsUpdated,
  }: {
    conversation: TConversation;
    onTagsUpdated: (names: string[], ids?: string[]) => void;
  }) {
    const mutation = useTagConversationMutation(conversation.conversationId ?? '', {
      onSuccess: (ids) => onTagsUpdated([], ids),
    });
    return createElement(
      'button',
      { onClick: () => mutation.mutate({ tag: 'tag', tagIds: ['late-id'] }) },
      'Tag',
    );
  }
  function Host() {
    const [conversation, setConversation] = useState<TConversation | null>(original);
    const onTagsUpdated = useBookmarkSuccess(conversation?.conversationId ?? '', setConversation);
    return createElement(
      'div',
      null,
      createElement('button', { onClick: () => setConversation(next) }, 'Navigate'),
      createElement('output', { 'data-testid': 'active-membership' }, JSON.stringify(conversation)),
      conversation &&
        createElement(Menu, { key: conversation.conversationId, conversation, onTagsUpdated }),
    );
  }
  render(createElement(QueryClientProvider, { client: queryClient }, createElement(Host)));
  fireEvent.click(screen.getByText('Tag'));
  await waitFor(() =>
    expect(dataService.addTagToConversation).toHaveBeenCalledWith('original', {
      tag: 'tag',
      tagIds: ['late-id'],
    }),
  );
  fireEvent.click(screen.getByText('Navigate'));
  await act(async () => resolveRequest(['late-id']));
  await waitFor(() =>
    expect(
      queryClient.getQueryData<TConversation>([QueryKeys.conversation, 'original'])?.tagIds,
    ).toEqual(['late-id']),
  );
  expect(JSON.parse(screen.getByTestId('active-membership').textContent ?? '')).toEqual(next);
  expect(queryClient.getQueryData([QueryKeys.conversation, 'next'])).toEqual(next);
});
