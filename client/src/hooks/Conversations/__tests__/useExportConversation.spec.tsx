import { act, renderHook, waitFor } from '@testing-library/react';
import { ContentTypes, QueryKeys } from 'librechat-data-provider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import useExportConversation from '../useExportConversation';

const mockBuild = jest.fn().mockResolvedValue([]);
jest.mock('~/hooks/Messages/useBuildMessageTree', () => ({
  __esModule: true,
  default: () => mockBuild,
}));
jest.mock('~/hooks', () => ({ useLocalize: () => (key: string) => key }));
jest.mock('~/hooks/ScreenshotContext', () => ({
  useScreenshot: () => ({ captureScreenshot: jest.fn() }),
}));
jest.mock('@librechat/client', () => ({ useToastContext: () => ({ showToast: jest.fn() }) }));
jest.mock('react-router-dom', () => ({ useParams: () => ({ conversationId: 'conversation' }) }));
jest.mock('downloadjs', () => jest.fn());
jest.mock('export-from-json', () =>
  Object.assign(jest.fn(), { types: { csv: 'csv', txt: 'txt' } }),
);
jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  buildTree: ({ messages }: { messages: object[] }) => messages,
}));

test.each(['json', 'text', 'markdown', 'csv'])(
  'detaches native identity for %s export while preserving image identity and the cached chat',
  async (type) => {
    mockBuild.mockClear();
    const client = new QueryClient();
    const image = {
      type: ContentTypes.IMAGE_FILE,
      native_media: { continuationRef: 'private' },
      thoughtSignature: 'private-signature',
      image_file: { file_id: 'image', filepath: '/images/owned.png' },
    };
    client.setQueryData(
      [QueryKeys.messages, 'conversation'],
      [{ messageId: 'message', content: [image] }],
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const hook = renderHook(
      () =>
        useExportConversation({
          conversation: null,
          filename: 'export',
          type,
          includeOptions: false,
          exportBranches: true,
          recursive: false,
        }),
      { wrapper },
    );
    act(() => hook.result.current.exportConversation());
    await waitFor(() => expect(mockBuild).toHaveBeenCalled());
    expect(mockBuild.mock.calls[0][0].messages[0].content).toEqual([
      { type: ContentTypes.IMAGE_FILE, image_file: image.image_file },
    ]);
    expect(client.getQueryData([QueryKeys.messages, 'conversation'])).toEqual([
      { messageId: 'message', content: [image] },
    ]);
    client.clear();
  },
);
