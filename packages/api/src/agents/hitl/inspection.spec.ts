import type { AppConfig } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';
import { getResumeContentInspection } from './inspection';

const strictExtractedTextConfig = {
  filters: {
    files: {
      pii: {
        fields: ['extracted_text'],
        starterPatterns: [],
        uninspectable: 'block',
      },
    },
  },
} as unknown as AppConfig;

function buildInput(trustLiveFileContent?: boolean) {
  return {
    appConfig: strictExtractedTextConfig,
    conversationId: 'conversation-1',
    targetMessageId: 'message-1',
    user: { id: 'user-1' },
    supplementalMessages: [
      {
        messageId: 'message-1',
        conversationId: 'conversation-1',
        parentMessageId: String(Constants.NO_PARENT),
        text: '',
        isCreatedByUser: true,
        files: [{ file_id: 'owned-file' }],
      },
    ],
    submittedMessages: [],
    liveFiles: [
      {
        file_id: 'owned-file',
        filename: 'forged.txt',
        type: 'text/plain',
        source: 'text',
        text: 'forged safe extraction',
      },
    ],
    ...(trustLiveFileContent != null && { trustLiveFileContent }),
    isTemporary: false,
    getMessages: jest.fn().mockResolvedValue([]),
    getFiles: jest.fn().mockResolvedValue([
      {
        file_id: 'owned-file',
        filename: 'opaque.pdf',
        type: 'application/pdf',
        source: 'local',
      },
    ]),
  };
}

describe('resume file inspection trust boundary', () => {
  it('does not accept request/job file metadata as extraction coverage', async () => {
    await expect(getResumeContentInspection(buildInput())).rejects.toMatchObject({
      code: 'content_filter_uninspectable',
      body: { source: 'file', field: 'extracted_text' },
    });
  });

  it('accepts explicitly trusted server-hydrated runtime extraction', async () => {
    await expect(getResumeContentInspection(buildInput(true))).resolves.toMatchObject({
      hydratedFiles: [
        expect.objectContaining({
          file_id: 'owned-file',
          filename: 'opaque.pdf',
          text: 'forged safe extraction',
        }),
      ],
    });
  });
});
