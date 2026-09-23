const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({ send: (...args: unknown[]) => mockSend(...args) })),
  GetObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn() },
}));

import { logger } from '@librechat/data-schemas';
import { resolveResponseAppInstructions } from '../generatedResponsePrompts';

describe('resolveResponseAppInstructions', () => {
  beforeEach(() => {
    mockSend.mockReset();
    jest.mocked(logger.info).mockReset();
  });

  test('reads the current S3 object and logs the exact object version', async () => {
    mockSend.mockResolvedValue({
      VersionId: 's3-version-123',
      Body: { transformToString: jest.fn().mockResolvedValue('Current app prompt.') },
    });

    await expect(resolveResponseAppInstructions(5)).resolves.toBe('Current app prompt.');
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        input: {
          Bucket: process.env.PROMPTS_BUCKET?.trim() || 'juristai-system-prompts',
          Key: 'prompts/responses/in-house-account-manager.txt',
        },
      }),
    );
    expect(logger.info).toHaveBeenCalledWith('responses_prompt_loaded', {
      appId: '5',
      promptId: 'juristai_app_5_in_house_account_manager',
      key: 'prompts/responses/in-house-account-manager.txt',
      versionId: 's3-version-123',
    });
  });
});
