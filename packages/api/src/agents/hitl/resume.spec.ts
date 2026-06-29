import type { Agents } from 'librechat-data-provider';
import {
  mapToolApprovalResolutions,
  mapAskUserAnswer,
  findUndecidedToolCalls,
  findDisallowedDecisions,
  findIncompleteDecisions,
} from './resume';

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

describe('findDisallowedDecisions', () => {
  const payload: Agents.ToolApprovalInterruptPayload = {
    type: 'tool_approval',
    action_requests: [
      { tool_call_id: 'a', name: 'read', arguments: {} },
      { tool_call_id: 'b', name: 'write', arguments: {} },
    ],
    review_configs: [
      { action_name: 'read', tool_call_id: 'a', allowed_decisions: ['approve', 'reject'] },
      { action_name: 'write', tool_call_id: 'b', allowed_decisions: ['reject', 'respond'] },
    ],
  };

  test('returns [] when every decision is permitted by its review config', () => {
    expect(
      findDisallowedDecisions(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'respond', responseText: 'x' },
      ]),
    ).toEqual([]);
  });

  test('flags a decision the policy does not allow for that tool', () => {
    // `b` is restricted to reject/respond — approving it must be rejected.
    expect(
      findDisallowedDecisions(payload, [
        { tool_call_id: 'a', decision: 'approve' },
        { tool_call_id: 'b', decision: 'approve' },
      ]),
    ).toEqual(['b']);
  });

  test('fails closed for a tool_call_id with no matching review config', () => {
    expect(findDisallowedDecisions(payload, [{ tool_call_id: 'z', decision: 'approve' }])).toEqual([
      'z',
    ]);
  });
});

describe('findIncompleteDecisions', () => {
  it('flags an edit decision without editedArguments', () => {
    expect(findIncompleteDecisions([{ tool_call_id: 'a', decision: 'edit' }])).toEqual(['a']);
  });

  it('flags an edit decision whose editedArguments is not a plain object', () => {
    expect(
      findIncompleteDecisions([
        {
          tool_call_id: 'a',
          decision: 'edit',
          editedArguments: [] as unknown as Record<string, unknown>,
        },
      ]),
    ).toEqual(['a']);
  });

  it('flags a respond decision without responseText (or empty)', () => {
    expect(findIncompleteDecisions([{ tool_call_id: 'a', decision: 'respond' }])).toEqual(['a']);
    expect(
      findIncompleteDecisions([{ tool_call_id: 'b', decision: 'respond', responseText: '' }]),
    ).toEqual(['b']);
  });

  it('accepts complete edit/respond and ignores approve/reject', () => {
    expect(
      findIncompleteDecisions([
        { tool_call_id: 'a', decision: 'edit', editedArguments: { q: 1 } },
        { tool_call_id: 'b', decision: 'respond', responseText: 'done' },
        { tool_call_id: 'c', decision: 'approve' },
        { tool_call_id: 'd', decision: 'reject', reason: 'no' },
      ]),
    ).toEqual([]);
  });
});
