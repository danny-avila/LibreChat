import { ContentTypes } from '../src/types/runs';
import { mergeEditedMessageContent } from '../src/messages';

describe('mergeEditedMessageContent', () => {
  it('folds the first matching completion part into the retained tail', () => {
    const retained = [{ type: ContentTypes.TEXT, text: 'Edited prefix' }];
    const completion = [
      { type: ContentTypes.TEXT, text: ' generated suffix' },
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-1', name: 'search' } },
    ];

    expect(mergeEditedMessageContent(retained, completion, ContentTypes.TEXT)).toEqual({
      content: [
        { type: ContentTypes.TEXT, text: 'Edited prefix generated suffix' },
        { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-1', name: 'search' } },
      ],
      firstPartMerged: true,
    });
  });

  it('keeps different content types in separate absolute slots', () => {
    const retained = [{ type: ContentTypes.TEXT, text: 'Edited prefix' }];
    const completion = [
      { type: ContentTypes.TOOL_CALL, tool_call: { id: 'call-1', name: 'search' } },
    ];

    expect(mergeEditedMessageContent(retained, completion, ContentTypes.TEXT)).toEqual({
      content: [...retained, ...completion],
      firstPartMerged: false,
    });
  });

  it('merges object text values without coercing them or mutating either snapshot', () => {
    const retained = [{ type: ContentTypes.TEXT, text: { value: 'Prefix', annotations: [] } }];
    const completion = [{ type: ContentTypes.TEXT, text: ' suffix' }];
    const before = JSON.parse(JSON.stringify({ retained, completion }));
    expect(mergeEditedMessageContent(retained, completion, ContentTypes.TEXT)).toEqual({
      content: [{ type: ContentTypes.TEXT, text: { value: 'Prefix suffix', annotations: [] } }],
      firstPartMerged: true,
    });
    expect({ retained, completion }).toEqual(before);
  });

  it('keeps prefix-only snapshots and shifts phase bounds by the folded prefix exactly once', () => {
    const retained = [
      { type: ContentTypes.TEXT, text: 'Introduction' },
      { type: ContentTypes.THINK, think: 'Prefix' },
    ];
    const completion = [
      { type: ContentTypes.THINK, think: ' suffix' },
      { type: ContentTypes.TEXT, text: 'Answer' },
      {
        type: ContentTypes.ACTIVITY_LABEL,
        activity_label_type: 'phase',
        activity_start_index: 0,
        activity_end_index: 2,
      },
    ];
    expect(mergeEditedMessageContent(retained, [], ContentTypes.THINK)).toEqual({
      content: retained,
      firstPartMerged: false,
    });
    const result = mergeEditedMessageContent(retained, completion, ContentTypes.THINK);
    expect(result.content).toHaveLength(4);
    expect(result.firstPartMerged).toBe(true);
    expect(result.content[3]).toEqual({
      ...completion[2],
      activity_start_index: 1,
      activity_end_index: 3,
    });
    expect(mergeEditedMessageContent(retained, completion, ContentTypes.THINK)).toEqual(result);
  });
});
