import { InfiniteCollections } from 'librechat-data-provider';
import type { InfiniteData } from '@tanstack/react-query';
import type { PromptGroupListResponse, TPromptGroup } from 'librechat-data-provider';
import {
  addPromptGroup,
  deletePromptGroup,
  updateGroupFields,
  updateGroupFieldsInPlace,
  updatePromptGroup,
  getSnippet,
  findPromptGroup,
} from '../promptGroups';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeGroup(overrides: Partial<TPromptGroup> = {}): TPromptGroup {
  return {
    _id: 'group-1',
    name: 'Default Group',
    numberOfGenerations: 0,
    onlyMyPrompts: false,
    ...overrides,
  } as TPromptGroup;
}

function makeInfiniteData(
  pages: Array<{ promptGroups: TPromptGroup[] }>,
): InfiniteData<PromptGroupListResponse> {
  return {
    pages: pages as PromptGroupListResponse[],
    pageParams: pages.map((_, i) => i),
  };
}

// ---------------------------------------------------------------------------
// updateGroupFieldsInPlace
// ---------------------------------------------------------------------------

describe('updateGroupFieldsInPlace', () => {
  it('updates matching group fields without changing its position', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const groupB = makeGroup({ _id: 'b', name: 'Group B' });
    const groupC = makeGroup({ _id: 'c', name: 'Group C' });

    const data = makeInfiniteData([{ promptGroups: [groupA, groupB, groupC] }]);

    const result = updateGroupFieldsInPlace(data, { _id: 'b', name: 'Group B Updated' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][1]).toMatchObject({
      _id: 'b',
      name: 'Group B Updated',
    });
    // Neighbours are unchanged
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({ _id: 'a' });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][2]).toMatchObject({ _id: 'c' });
    // Length is preserved
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(3);
  });

  it('does NOT move the group to page 0 (stays on original page)', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const groupB = makeGroup({ _id: 'b', name: 'Group B' });

    const data = makeInfiniteData([{ promptGroups: [groupA] }, { promptGroups: [groupB] }]);

    const result = updateGroupFieldsInPlace(data, { _id: 'b', name: 'Group B Updated' });

    // Group B stays on page 1
    expect(result.pages[1][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'b',
      name: 'Group B Updated',
    });
    // Page 0 is unchanged
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(1);
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({ _id: 'a' });
  });

  it('does NOT set updatedAt on the updated group', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);

    const result = updateGroupFieldsInPlace(data, { _id: 'a', name: 'Changed' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0].updatedAt).toBeUndefined();
  });

  it('returns data unchanged when the group is not found', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);
    const snapshot = JSON.stringify(data);

    const result = updateGroupFieldsInPlace(data, { _id: 'nonexistent', name: 'Ghost' });

    expect(JSON.stringify(result)).toBe(snapshot);
  });

  it('merges only the provided partial fields, preserving others', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A', numberOfGenerations: 5 });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);

    const result = updateGroupFieldsInPlace(data, { _id: 'a', name: 'Group A Renamed' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'a',
      name: 'Group A Renamed',
      numberOfGenerations: 5,
    });
  });

  it('does not mutate the original data', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);
    const snapshot = JSON.stringify(data);

    updateGroupFieldsInPlace(data, { _id: 'a', name: 'Changed' });

    expect(JSON.stringify(data)).toBe(snapshot);
  });

  it('handles an empty pages array without throwing', () => {
    const data = makeInfiniteData([]);
    expect(() => updateGroupFieldsInPlace(data, { _id: 'a', name: 'Ghost' })).not.toThrow();
  });

  it('handles a page with an empty promptGroups array without throwing', () => {
    const data = makeInfiniteData([{ promptGroups: [] }]);
    const result = updateGroupFieldsInPlace(data, { _id: 'a', name: 'Ghost' });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(0);
  });

  it('preserves pageParams on the returned data', () => {
    const groupA = makeGroup({ _id: 'a', name: 'Group A' });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);

    const result = updateGroupFieldsInPlace(data, { _id: 'a', name: 'Changed' });

    expect(result.pageParams).toEqual(data.pageParams);
  });

  it('handles groups across three pages, updating only the matching page', () => {
    const data = makeInfiniteData([
      { promptGroups: [makeGroup({ _id: 'a', name: 'A' })] },
      { promptGroups: [makeGroup({ _id: 'b', name: 'B' })] },
      { promptGroups: [makeGroup({ _id: 'c', name: 'C' })] },
    ]);

    const result = updateGroupFieldsInPlace(data, { _id: 'c', name: 'C Updated' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'a',
      name: 'A',
    });
    expect(result.pages[1][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'b',
      name: 'B',
    });
    expect(result.pages[2][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'c',
      name: 'C Updated',
    });
  });
});

// ---------------------------------------------------------------------------
// Contrast: updateGroupFields DOES move item and set updatedAt
// ---------------------------------------------------------------------------

describe('updateGroupFields (contrast with updateGroupFieldsInPlace)', () => {
  it('moves updated group to page 0 and sets updatedAt', () => {
    const data = makeInfiniteData([
      { promptGroups: [makeGroup({ _id: 'a', name: 'A' })] },
      { promptGroups: [makeGroup({ _id: 'b', name: 'B' })] },
    ]);

    const result = updateGroupFields(data, { _id: 'b', name: 'B Updated' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'b',
      name: 'B Updated',
    });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0].updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// addPromptGroup
// ---------------------------------------------------------------------------

describe('addPromptGroup', () => {
  it('adds a new group to the top of page 0', () => {
    const existing = makeGroup({ _id: 'a', name: 'A' });
    const data = makeInfiniteData([{ promptGroups: [existing] }]);
    const newGroup = makeGroup({ _id: 'new', name: 'New Group' });

    const result = addPromptGroup(data, newGroup);

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({ _id: 'new' });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(2);
  });

  it('updates via updateData when the group already exists', () => {
    const existing = makeGroup({ _id: 'a', name: 'A' });
    const data = makeInfiniteData([{ promptGroups: [existing] }]);

    const result = addPromptGroup(data, { ...existing, name: 'A Updated' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'a',
      name: 'A Updated',
    });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0].updatedAt).toBeDefined();
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// updatePromptGroup
// ---------------------------------------------------------------------------

describe('updatePromptGroup', () => {
  it('moves the updated group to the top of page 0 and sets updatedAt', () => {
    const groupA = makeGroup({ _id: 'a', name: 'A' });
    const groupB = makeGroup({ _id: 'b', name: 'B' });
    const data = makeInfiniteData([{ promptGroups: [groupA, groupB] }]);

    const result = updatePromptGroup(data, { ...groupB, name: 'B Updated' });

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({
      _id: 'b',
      name: 'B Updated',
    });
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0].updatedAt).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// deletePromptGroup
// ---------------------------------------------------------------------------

describe('deletePromptGroup', () => {
  it('removes the matching group from its page', () => {
    const groupA = makeGroup({ _id: 'a', name: 'A' });
    const groupB = makeGroup({ _id: 'b', name: 'B' });
    const data = makeInfiniteData([{ promptGroups: [groupA, groupB] }]);

    const result = deletePromptGroup(data, 'a');

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(1);
    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS][0]).toMatchObject({ _id: 'b' });
  });

  it('leaves data unchanged when the group is not found', () => {
    const groupA = makeGroup({ _id: 'a', name: 'A' });
    const data = makeInfiniteData([{ promptGroups: [groupA] }]);

    const result = deletePromptGroup(data, 'nonexistent');

    expect(result.pages[0][InfiniteCollections.PROMPT_GROUPS]).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// findPromptGroup
// ---------------------------------------------------------------------------

describe('findPromptGroup', () => {
  it('returns matching group from page 0', () => {
    const groupA = makeGroup({ _id: 'a', name: 'A' });
    const groupB = makeGroup({ _id: 'b', name: 'B' });
    const data = makeInfiniteData([{ promptGroups: [groupA, groupB] }]);

    const result = findPromptGroup(data, (g) => g._id === 'b');

    expect(result).toMatchObject({ _id: 'b', name: 'B' });
  });

  it('returns matching group from a later page', () => {
    const data = makeInfiniteData([
      { promptGroups: [makeGroup({ _id: 'a', name: 'A' })] },
      { promptGroups: [makeGroup({ _id: 'b', name: 'B' })] },
    ]);

    const result = findPromptGroup(data, (g) => g._id === 'b');

    expect(result).toMatchObject({ _id: 'b' });
  });

  it('returns undefined when no group matches', () => {
    const data = makeInfiniteData([{ promptGroups: [makeGroup({ _id: 'a' })] }]);
    expect(findPromptGroup(data, (g) => g._id === 'z')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// getSnippet
// ---------------------------------------------------------------------------

describe('getSnippet', () => {
  it('returns the full string when it is within the default length', () => {
    const short = 'Hello';
    expect(getSnippet(short)).toBe('Hello');
  });

  it('truncates and appends ellipsis when string exceeds default length', () => {
    const long = 'a'.repeat(60);
    const result = getSnippet(long);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBe(56);
  });

  it('respects a custom length parameter', () => {
    const text = 'abcdefghij';
    const result = getSnippet(text, 7);
    expect(result).toBe('abcd...');
    expect(result.length).toBe(7);
  });

  it('returns the original string when it equals the length exactly', () => {
    const text = 'a'.repeat(56);
    expect(getSnippet(text)).toBe(text);
  });

  it('handles an empty string without throwing', () => {
    expect(getSnippet('')).toBe('');
  });
});
