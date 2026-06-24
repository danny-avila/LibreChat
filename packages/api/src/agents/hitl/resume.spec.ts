import type { Agents } from 'librechat-data-provider';
import { mapToolApprovalResolutions, mapAskUserAnswer, findUndecidedToolCalls } from './resume';

describe('mapToolApprovalResolutions', () => {
  test('maps each decision type to the SDK discriminated shape, keyed by tool_call_id', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'approve' },
      { tool_call_id: 'b', decision: 'reject', reason: 'no' },
      { tool_call_id: 'c', decision: 'edit', editedArguments: { x: 1 } },
      { tool_call_id: 'd', decision: 'respond', responseText: 'done' },
    ];

    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'approve' },
      b: { type: 'reject', reason: 'no' },
      c: { type: 'edit', updatedInput: { x: 1 } },
      d: { type: 'respond', responseText: 'done' },
    });
  });

  test('defaults missing edit args to {} and missing respond text to "" rather than throwing', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'edit' },
      { tool_call_id: 'b', decision: 'respond' },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'edit', updatedInput: {} },
      b: { type: 'respond', responseText: '' },
    });
  });

  test('fails closed (reject) on an unrecognized decision', () => {
    const resolutions = [
      { tool_call_id: 'a', decision: 'nonsense' as Agents.ToolApprovalDecisionType },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({
      a: { type: 'reject', reason: 'Unrecognized approval decision' },
    });
  });

  test('last write wins when the same tool_call_id appears twice', () => {
    const resolutions: Agents.ToolApprovalResolution[] = [
      { tool_call_id: 'a', decision: 'approve' },
      { tool_call_id: 'a', decision: 'reject' },
    ];
    expect(mapToolApprovalResolutions(resolutions)).toEqual({ a: { type: 'reject' } });
  });
});

describe('mapAskUserAnswer', () => {
  test('passes the answer through unchanged', () => {
    expect(mapAskUserAnswer({ answer: 'staging' })).toEqual({ answer: 'staging' });
  });
});

describe('findUndecidedToolCalls', () => {
  const payload: Agents.ToolApprovalInterruptPayload = {
    type: 'tool_approval',
    action_requests: [
      { tool_call_id: 'a', name: 'read', arguments: {} },
      { tool_call_id: 'b', name: 'write', arguments: {} },
    ],
    review_configs: [],
  };

  test('returns the tool_call_ids with no decision', () => {
    expect(findUndecidedToolCalls(payload, [{ tool_call_id: 'a', decision: 'approve' }])).toEqual([
      'b',
    ]);
  });

  test('returns [] when every requested tool call is decided', () => {
    expect(
      findUndecidedToolCalls(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'reject' },
      ]),
    ).toEqual([]);
  });

  test('ignores resolutions for tool calls not in the action', () => {
    expect(
      findUndecidedToolCalls(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'approve' },
        { tool_call_id: 'z', decision: 'approve' },
      ]),
    ).toEqual([]);
  });
});
