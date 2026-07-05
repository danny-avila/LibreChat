import { ContentTypes, ToolCallTypes } from 'librechat-data-provider';
import type { TMessage } from 'librechat-data-provider';
import type { ExportableContentPart, MessageContentExport } from '../format';
import type { LocalizeFunction } from '~/common';
import { formatMessageText, formatMessageContent, handledExportContentTypes } from '../format';

const localize: LocalizeFunction = ((key: string) =>
  key === 'com_ui_run_code'
    ? 'Run code'
    : key === 'com_endpoint_thinking'
      ? 'Thinking'
      : key) as LocalizeFunction;

const imageFile = {
  file_id: 'file-1',
  filename: 'chart.png',
  filepath: '/images/chart.png',
  height: 480,
  width: 640,
};

const contentByType: Record<ContentTypes, ExportableContentPart> = {
  [ContentTypes.TEXT]: {
    type: ContentTypes.TEXT,
    text: 'Visible answer',
  },
  [ContentTypes.THINK]: {
    type: ContentTypes.THINK,
    think: 'Reasoning step',
  },
  [ContentTypes.TEXT_DELTA]: {
    type: ContentTypes.TEXT_DELTA,
    text_delta: 'Streaming text',
  },
  [ContentTypes.TOOL_CALL]: {
    type: ContentTypes.TOOL_CALL,
    tool_call: {
      id: 'call-1',
      type: ToolCallTypes.CODE_INTERPRETER,
      code_interpreter: {
        input: 'print(1)',
        outputs: [],
      },
    },
  } as ExportableContentPart,
  [ContentTypes.IMAGE_FILE]: {
    type: ContentTypes.IMAGE_FILE,
    image_file: imageFile,
  } as ExportableContentPart,
  [ContentTypes.IMAGE_URL]: {
    type: ContentTypes.IMAGE_URL,
    image_url: 'https://example.com/image.png',
  },
  [ContentTypes.VIDEO_URL]: {
    type: ContentTypes.VIDEO_URL,
    video_url: { url: 'https://example.com/video.mp4' },
  },
  [ContentTypes.INPUT_AUDIO]: {
    type: ContentTypes.INPUT_AUDIO,
    input_audio: {
      data: 'base64-audio',
      format: 'wav',
    },
  },
  [ContentTypes.AGENT_UPDATE]: {
    type: ContentTypes.AGENT_UPDATE,
    agent_update: {
      index: 0,
      runId: 'run-1',
      agentId: 'agent-1',
    },
  },
  [ContentTypes.SUMMARY]: {
    type: ContentTypes.SUMMARY,
    content: [{ type: ContentTypes.TEXT, text: 'Summary text' }],
  },
  [ContentTypes.ERROR]: {
    type: ContentTypes.ERROR,
    error: 'Something failed',
  },
};

const expectedMarkdownByType: Record<ContentTypes, MessageContentExport> = {
  [ContentTypes.TEXT]: ['Assistant', 'Visible answer'],
  [ContentTypes.THINK]: [
    'Assistant',
    '<details>\n<summary>Thinking</summary>\n\nReasoning step\n</details>',
  ],
  [ContentTypes.TEXT_DELTA]: ['Assistant', 'Streaming text'],
  [ContentTypes.TOOL_CALL]: ['Run code', '{"input":"print(1)","outputs":[]}'],
  [ContentTypes.IMAGE_FILE]: ['Image', JSON.stringify(imageFile)],
  [ContentTypes.IMAGE_URL]: ['Image', 'https://example.com/image.png'],
  [ContentTypes.VIDEO_URL]: ['Video', 'https://example.com/video.mp4'],
  [ContentTypes.INPUT_AUDIO]: ['Audio', '{"data":"base64-audio","format":"wav"}'],
  [ContentTypes.AGENT_UPDATE]: ['Agent Update', '{"index":0,"runId":"run-1","agentId":"agent-1"}'],
  [ContentTypes.SUMMARY]: ['Summary', 'Summary text'],
  [ContentTypes.ERROR]: ['Assistant', 'Something failed'],
};

describe('handledExportContentTypes', () => {
  it('accounts for every content type before formatting exports', () => {
    expect([...handledExportContentTypes].sort()).toEqual(Object.values(ContentTypes).sort());
  });
});

describe('formatMessageContent', () => {
  it.each(Object.values(ContentTypes))('formats %s content explicitly', (type) => {
    expect(
      formatMessageContent({
        sender: 'Assistant',
        content: contentByType[type],
        format: 'md',
        localize,
      }),
    ).toEqual(expectedMarkdownByType[type]);
  });

  it('formats reasoning content as readable markdown instead of raw JSON', () => {
    const result = formatMessageContent({
      sender: 'DeepInfra',
      content: {
        type: ContentTypes.THINK,
        think: 'Thinking Process:\n\n1. Analyze the request',
      },
      format: 'md',
      localize,
    });

    expect(result).toEqual([
      'DeepInfra',
      '<details>\n<summary>Thinking</summary>\n\nThinking Process:\n\n1. Analyze the request\n</details>',
    ]);
    expect(result[1]).not.toContain('{"type":"think"');
  });

  it('formats reasoning content readably for text exports', () => {
    expect(
      formatMessageContent({
        sender: 'Assistant',
        content: { type: ContentTypes.THINK, think: 'Check assumptions' },
        localize,
      }),
    ).toEqual(['Assistant', 'Thinking:\nCheck assumptions']);
  });

  it('strips THINK delimiters before formatting reasoning exports', () => {
    expect(
      formatMessageContent({
        sender: 'Assistant',
        content: { type: ContentTypes.THINK, think: '<think>\nCheck assumptions\n</think>' },
        format: 'md',
        localize,
      }),
    ).toEqual([
      'Assistant',
      '<details>\n<summary>Thinking</summary>\n\nCheck assumptions\n</details>',
    ]);
  });

  it('concatenates summary chunks without inserted paragraphs', () => {
    expect(
      formatMessageContent({
        sender: 'Assistant',
        content: {
          type: ContentTypes.SUMMARY,
          content: [
            { type: ContentTypes.TEXT, text: 'The ' },
            { type: ContentTypes.TEXT, text: 'answer' },
          ],
        },
        format: 'md',
        localize,
      }),
    ).toEqual(['Summary', 'The answer']);
  });
});

describe('formatMessageText', () => {
  it('formats markdown messages with reasoning and visible text parts', () => {
    const message = {
      sender: 'DeepInfra',
      content: [
        { type: ContentTypes.THINK, think: 'Hidden chain' },
        { type: ContentTypes.TEXT, text: 'Final answer' },
      ],
    } as Partial<TMessage>;

    expect(formatMessageText({ message, format: 'md', localize })).toBe(
      '**DeepInfra**\n<details>\n<summary>Thinking</summary>\n\nHidden chain\n</details>\n\n\n**DeepInfra**\nFinal answer',
    );
  });
});
