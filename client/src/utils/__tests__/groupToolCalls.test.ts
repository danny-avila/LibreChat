import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';
import { groupSequentialToolCalls } from '../groupToolCalls';

const toolCall = (id: string): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: { id, name: 'web_search', args: '{}', output: 'ok' },
  }) as unknown as TMessageContentParts;

const think = (text: string): TMessageContentParts =>
  ({ type: ContentTypes.THINK, [ContentTypes.THINK]: text }) as unknown as TMessageContentParts;

const label = (text: string): TMessageContentParts =>
  ({
    type: ContentTypes.ACTIVITY_LABEL,
    [ContentTypes.ACTIVITY_LABEL]: text,
    pending: text.length === 0,
  }) as unknown as TMessageContentParts;

const withIndex = (parts: TMessageContentParts[]): PartWithIndex[] =>
  parts.map((part, idx) => ({ part, idx }));

describe('groupSequentialToolCalls with activity labels', () => {
  /**
   * Every batch publishes its reservation the moment the batch ends, so an
   * empty label is the NORMAL state while generation is in flight. It must
   * render exactly as the feature-off path does: a lone tool call stays a
   * single (no group wrapper) and THINK parts stay standalone.
   */
  it('leaves a single tool call and its reasoning untouched while the label is empty', () => {
    const grouped = groupSequentialToolCalls(
      withIndex([think('deciding what to search'), toolCall('t1'), label('')]),
    );

    expect(grouped).toHaveLength(2);
    expect(grouped[0]).toMatchObject({ type: 'single' });
    expect(grouped[1]).toMatchObject({ type: 'single' });
    /** No labelPart anywhere, and crucially no 'tool-group' wrapper. */
    expect(grouped.some((entry) => entry.type === 'tool-group')).toBe(false);
  });

  /** A blank/failed fill is permanent, and must stay equally invisible. */
  it('keeps legacy splitting for two tool calls when the label never fills', () => {
    const grouped = groupSequentialToolCalls(
      withIndex([toolCall('t1'), toolCall('t2'), label('')]),
    );

    /** Two adjacent tool calls group even without the feature. */
    expect(grouped).toHaveLength(1);
    expect(grouped[0]).toMatchObject({ type: 'tool-group' });
    expect((grouped[0] as { labelPart?: PartWithIndex }).labelPart).toBeUndefined();
  });

  /** Once real text lands the block becomes one labeled group, THINK included. */
  it('absorbs reasoning into a labeled group once the label has text', () => {
    const grouped = groupSequentialToolCalls(
      withIndex([
        think('deciding what to search'),
        toolCall('t1'),
        label('Found the failing spec'),
      ]),
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe('tool-group');
    const group = grouped[0] as { parts: PartWithIndex[]; labelPart?: PartWithIndex };
    expect(group.parts).toHaveLength(2);
    expect(group.labelPart?.part).toMatchObject({
      [ContentTypes.ACTIVITY_LABEL]: 'Found the failing spec',
    });
  });

  /** An empty orphan label has nothing to render and no block to delimit. */
  it('drops an empty orphan label entirely', () => {
    expect(groupSequentialToolCalls(withIndex([label('')]))).toEqual([]);
  });
});
