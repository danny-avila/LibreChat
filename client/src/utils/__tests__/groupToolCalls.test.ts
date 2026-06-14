import { Constants, ContentTypes } from 'librechat-data-provider';
import type { TMessageContentParts } from 'librechat-data-provider';
import type { PartWithIndex } from '~/components/Chat/Messages/Content/ParallelContent';
import { groupSequentialToolCalls } from '../groupToolCalls';

const toolPart = (id: string, name = 'fetch'): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: { id, name, args: '{}', output: 'done' },
  }) as unknown as TMessageContentParts;

const thinkPart = (text = 'reasoning'): TMessageContentParts =>
  ({ type: ContentTypes.THINK, think: text }) as unknown as TMessageContentParts;

const textPart = (text = 'answer'): TMessageContentParts =>
  ({ type: ContentTypes.TEXT, text }) as unknown as TMessageContentParts;

const transferPart = (): TMessageContentParts =>
  ({
    type: ContentTypes.TOOL_CALL,
    [ContentTypes.TOOL_CALL]: {
      id: 'x',
      name: `${Constants.LC_TRANSFER_TO_}agent`,
      args: '{}',
    },
  }) as unknown as TMessageContentParts;

const withIndex = (parts: TMessageContentParts[]): PartWithIndex[] =>
  parts.map((part, idx) => ({ part, idx }));

describe('groupSequentialToolCalls', () => {
  it('groups two adjacent tool calls', () => {
    const result = groupSequentialToolCalls(withIndex([toolPart('a'), toolPart('b')]));
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ type: 'tool-group' });
    expect(result[0].type === 'tool-group' && result[0].parts).toHaveLength(2);
  });

  it('keeps a single tool call ungrouped', () => {
    const result = groupSequentialToolCalls(withIndex([toolPart('a')]));
    expect(result).toEqual([{ type: 'single', part: { part: expect.anything(), idx: 0 } }]);
  });

  it('absorbs reasoning interleaved between tool calls into one group', () => {
    const result = groupSequentialToolCalls(withIndex([toolPart('a'), thinkPart(), toolPart('b')]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool-group');
    expect(result[0].type === 'tool-group' && result[0].parts.map((p) => p.idx)).toEqual([0, 1, 2]);
  });

  it('absorbs leading and trailing reasoning around a tool run', () => {
    const result = groupSequentialToolCalls(
      withIndex([thinkPart('lead'), toolPart('a'), toolPart('b'), thinkPart('trail')]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool-group');
    expect(result[0].type === 'tool-group' && result[0].parts).toHaveLength(4);
  });

  it('groups a lone tool call wrapped in reasoning (e.g. a skill)', () => {
    const result = groupSequentialToolCalls(withIndex([thinkPart(), toolPart('a'), thinkPart()]));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('tool-group');
    expect(result[0].type === 'tool-group' && result[0].parts.map((p) => p.idx)).toEqual([0, 1, 2]);
  });

  it('keeps a lone tool call without reasoning inline', () => {
    const result = groupSequentialToolCalls(withIndex([toolPart('a'), textPart()]));
    expect(result.map((g) => g.type)).toEqual(['single', 'single']);
  });

  it('keeps pure reasoning (no tool call) standalone', () => {
    const result = groupSequentialToolCalls(withIndex([thinkPart(), textPart()]));
    expect(result.map((g) => g.type)).toEqual(['single', 'single']);
  });

  it('does not pull a thought-then-answer tail into a preceding group', () => {
    const result = groupSequentialToolCalls(
      withIndex([toolPart('a'), toolPart('b'), textPart(), thinkPart(), textPart('final')]),
    );
    expect(result.map((g) => g.type)).toEqual(['tool-group', 'single', 'single', 'single']);
  });

  it('splits tool runs separated by a non-reasoning part', () => {
    const result = groupSequentialToolCalls(
      withIndex([toolPart('a'), toolPart('b'), textPart(), toolPart('c'), toolPart('d')]),
    );
    expect(result.map((g) => g.type)).toEqual(['tool-group', 'single', 'tool-group']);
  });

  it('does not group transfer/handoff tool calls', () => {
    const result = groupSequentialToolCalls(withIndex([transferPart(), transferPart()]));
    expect(result.map((g) => g.type)).toEqual(['single', 'single']);
  });
});
