import { updateMessage } from './data-service';
import request from './request';

jest.mock('./request', () => ({
  __esModule: true,
  default: {
    put: jest.fn(),
  },
}));

const put = jest.mocked(request.put);

type UpdateMessageCase = {
  name: string;
  removedFileIds: string[] | undefined;
  expectedBody: { text: string; removedFileIds?: string[] };
};

describe('updateMessage', () => {
  beforeEach(() => {
    put.mockReset().mockResolvedValue(undefined);
  });

  it.each<UpdateMessageCase>([
    {
      name: 'omits undefined removedFileIds',
      removedFileIds: undefined,
      expectedBody: { text: 'Updated prompt' },
    },
    {
      name: 'preserves an empty removedFileIds list',
      removedFileIds: [],
      expectedBody: { text: 'Updated prompt', removedFileIds: [] },
    },
    {
      name: 'preserves a non-empty removedFileIds list',
      removedFileIds: ['file-1'],
      expectedBody: { text: 'Updated prompt', removedFileIds: ['file-1'] },
    },
  ])('$name', async ({ removedFileIds, expectedBody }) => {
    await updateMessage({
      conversationId: 'conversation-1',
      messageId: 'message-1',
      model: 'test-model',
      text: 'Updated prompt',
      removedFileIds,
    });

    expect(put).toHaveBeenCalledWith('/api/messages/conversation-1/message-1', expectedBody);
    expect(put).toHaveBeenCalledTimes(1);
  });
});
