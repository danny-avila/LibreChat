import { createElement } from 'react';
import download from 'downloadjs';
import { dataService } from 'librechat-data-provider';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TConversation } from 'librechat-data-provider';
import type { ReactNode } from 'react';
import useExportConversation from '../useExportConversation';

jest.mock('downloadjs', () => jest.fn());
jest.mock('librechat-data-provider', () => {
  const actual = jest.requireActual('librechat-data-provider');
  return {
    ...actual,
    dataService: { ...actual.dataService, getConversationById: jest.fn() },
  };
});
jest.mock('react-router-dom', () => ({ useParams: () => ({ conversationId: 'export-chat' }) }));
jest.mock('@librechat/client', () => ({ useToastContext: () => ({ showToast: jest.fn() }) }));
jest.mock('~/hooks/ScreenshotContext', () => ({ useScreenshot: () => ({}) }));
jest.mock('~/hooks/Messages/useBuildMessageTree', () => () => async () => []);
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/utils', () => ({ cleanupPreset: (options: object) => options }));

const conversation = {
  conversationId: 'export-chat',
  title: 'Cached chat',
  endpoint: 'openAI',
  tags: ['Cached label'],
  tagIds: ['private-database-id'],
} as TConversation;

function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

it.each([false, true])(
  'downloads portable JSON when refreshing metadata fails (options %s)',
  async (includeOptions) => {
    jest.mocked(dataService.getConversationById).mockRejectedValue(new Error('Offline'));
    const queryClient = new QueryClient();
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);
    const { result } = renderHook(
      () =>
        useExportConversation({
          conversation,
          filename: 'export',
          type: 'json',
          includeOptions,
          exportBranches: false,
          recursive: false,
        }),
      { wrapper },
    );
    act(() => result.current.exportConversation());
    await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
    const blob = jest.mocked(download).mock.calls[0][0] as Blob;
    const exported = JSON.parse(await readBlob(blob));
    expect(exported.options.tags).toEqual(['Cached label']);
    expect(exported.options).not.toHaveProperty('tagIds');
    expect(exported.messages).toEqual([]);
  },
);

it('exports refreshed labels without exposing local IDs', async () => {
  jest
    .spyOn(dataService, 'getConversationById')
    .mockResolvedValue({ ...conversation, tags: ['Renamed'] });
  const queryClient = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(
    () =>
      useExportConversation({
        conversation,
        filename: 'export',
        type: 'json',
        includeOptions: true,
        exportBranches: false,
        recursive: false,
      }),
    { wrapper },
  );
  act(() => result.current.exportConversation());
  await waitFor(() => expect(download).toHaveBeenCalledTimes(1));
  const exported = JSON.parse(await readBlob(jest.mocked(download).mock.calls[0][0] as Blob));
  expect(exported.options.tags).toEqual(['Renamed']);
  expect(exported.options).not.toHaveProperty('tagIds');
});
