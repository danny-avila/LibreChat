import { ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import { groupParallelContent, lastParallelColumnCursorIdx } from '../ParallelContent';

describe('groupParallelContent', () => {
  test('reports absolute indices for a dense phase segment', () => {
    const sequential = {
      type: ContentTypes.TEXT,
      text: 'before lanes',
    } as unknown as TMessageContentParts;
    const parallel = {
      type: ContentTypes.TEXT,
      text: 'lane result',
      groupId: 1,
      agentId: 'agent-1',
    } as unknown as TMessageContentParts;

    const grouped = groupParallelContent([sequential, parallel], 4);

    expect(grouped.sequentialParts).toEqual([{ part: sequential, idx: 4 }]);
    expect(grouped.parallelSections[0]?.columns[0]?.parts).toEqual([{ part: parallel, idx: 5 }]);
  });

  test('preserves absolute indices for a compacted sparse phase segment', () => {
    const sequential = {
      type: ContentTypes.TEXT,
      text: 'before lanes',
    } as unknown as TMessageContentParts;
    const parallel = {
      type: ContentTypes.TEXT,
      text: 'lane result',
      groupId: 1,
      agentId: 'agent-1',
    } as unknown as TMessageContentParts;

    const grouped = groupParallelContent([sequential, parallel], 0, [2, 10_000]);

    expect(grouped.sequentialParts).toEqual([{ part: sequential, idx: 2 }]);
    expect(grouped.parallelSections[0]?.columns[0]?.parts).toEqual([
      { part: parallel, idx: 10_000 },
    ]);
  });
});

describe('lastParallelColumnCursorIdx', () => {
  test('keeps the lane cursor on visible output before an empty placeholder', () => {
    const visible = {
      type: ContentTypes.TEXT,
      text: 'Visible answer',
      groupId: 1,
      agentId: 'agent-1',
    } as unknown as TMessageContentParts;
    const empty = {
      type: ContentTypes.TEXT,
      text: '',
      groupId: 1,
      agentId: 'agent-1',
    } as unknown as TMessageContentParts;

    expect(
      lastParallelColumnCursorIdx([
        { part: visible, idx: 7 },
        { part: empty, idx: 8 },
      ]),
    ).toBe(7);
  });
});
