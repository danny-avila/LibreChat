const { processMessages } = require('./manage');
const { retrieveAndProcessFile } = require('~/server/services/Files/process');

jest.mock('~/server/services/Files/process', () => ({
  retrieveAndProcessFile: jest.fn(),
}));

describe('processMessages', () => {
  let openai, client;

  beforeEach(() => {
    openai = {};
    client = {
      processedFileIds: new Set(),
    };
    jest.clearAllMocks();
    retrieveAndProcessFile.mockReset();
  });

  test('handles normal case with single source', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^ and another^1^',
              annotations: [
                {
                  type: 'file_citation',
                  start_index: 15,
                  end_index: 18,
                  file_citation: { file_id: 'file1' },
                },
                {
                  type: 'file_citation',
                  start_index: 30,
                  end_index: 33,
                  file_citation: { file_id: 'file1' },
                },
              ],
            },
          },
        ],
        created_at: 1,
      },
    ];

    retrieveAndProcessFile.mockResolvedValue({ filename: 'test.txt' });

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe('This is a test ^1^ and another^1^\n\n^1.^ test.txt');
    expect(result.edited).toBe(true);
  });

  test('handles multiple different sources', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^ and another^2^',
              annotations: [
                {
                  type: 'file_citation',
                  start_index: 15,
                  end_index: 18,
                  file_citation: { file_id: 'file1' },
                },
                {
                  type: 'file_citation',
                  start_index: 30,
                  end_index: 33,
                  file_citation: { file_id: 'file2' },
                },
              ],
            },
          },
        ],
        created_at: 1,
      },
    ];

    retrieveAndProcessFile
      .mockResolvedValueOnce({ filename: 'test1.txt' })
      .mockResolvedValueOnce({ filename: 'test2.txt' });

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe('This is a test ^1^ and another^2^\n\n^1.^ test1.txt\n^2.^ test2.txt');
    expect(result.edited).toBe(true);
  });

  test('handles file retrieval failure', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^',
              annotations: [
                {
                  type: 'file_citation',
                  start_index: 15,
                  end_index: 18,
                  file_citation: { file_id: 'file1' },
                },
              ],
            },
          },
        ],
        created_at: 1,
      },
    ];

    retrieveAndProcessFile.mockRejectedValue(new Error('File not found'));

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe('This is a test ^1^');
    expect(result.edited).toBe(false);
  });

  test('handles citations without file ids', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^',
              annotations: [{ type: 'file_citation', start_index: 15, end_index: 18 }],
            },
          },
        ],
        created_at: 1,
      },
    ];

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe('This is a test ^1^');
    expect(result.edited).toBe(false);
  });

  test('handles mixed valid and invalid citations', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^ and ^2^ and ^3^',
              annotations: [
                {
                  type: 'file_citation',
                  start_index: 15,
                  end_index: 18,
                  file_citation: { file_id: 'file1' },
                },
                { type: 'file_citation', start_index: 23, end_index: 26 },
                {
                  type: 'file_citation',
                  start_index: 31,
                  end_index: 34,
                  file_citation: { file_id: 'file3' },
                },
              ],
            },
          },
        ],
        created_at: 1,
      },
    ];

    retrieveAndProcessFile
      .mockResolvedValueOnce({ filename: 'test1.txt' })
      .mockResolvedValueOnce({ filename: 'test3.txt' });

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe(
      'This is a test ^1^ and ^2^ and ^2^\n\n^1.^ test1.txt\n^2.^ test3.txt',
    );
    expect(result.edited).toBe(true);
  });

  test('handles adjacent identical citations', async () => {
    const messages = [
      {
        content: [
          {
            type: 'text',
            text: {
              value: 'This is a test ^1^^1^ and ^1^ ^1^',
              annotations: [
                {
                  type: 'file_citation',
                  start_index: 15,
                  end_index: 18,
                  file_citation: { file_id: 'file1' },
                },
                {
                  type: 'file_citation',
                  start_index: 18,
                  end_index: 21,
                  file_citation: { file_id: 'file1' },
                },
                {
                  type: 'file_citation',
                  start_index: 26,
                  end_index: 29,
                  file_citation: { file_id: 'file1' },
                },
                {
                  type: 'file_citation',
                  start_index: 30,
                  end_index: 33,
                  file_citation: { file_id: 'file1' },
                },
              ],
            },
          },
        ],
        created_at: 1,
      },
    ];

    retrieveAndProcessFile.mockResolvedValue({ filename: 'test.txt' });

    const result = await processMessages({ openai, client, messages });

    expect(result.text).toBe('This is a test ^1^ and ^1^\n\n^1.^ test.txt');
    expect(result.edited).toBe(true);
  });
});
