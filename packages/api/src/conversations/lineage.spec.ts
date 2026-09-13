import { logger } from '@librechat/data-schemas';
import { Constants } from 'librechat-data-provider';

import type { LineageMessage } from './lineage';
import { breakParentCycles, orderMessageLineage, orderParentTimestamps } from './lineage';

const BASE = Date.UTC(2024, 0, 1);

const at = (offset: number): Date => new Date(BASE + offset);

const message = (messageId: string, parentMessageId: string, offset = 0): LineageMessage => ({
  messageId,
  parentMessageId,
  createdAt: at(offset),
});

const timeOf = (messages: LineageMessage[], messageId: string): number =>
  messages.find((entry) => entry.messageId === messageId)?.createdAt.getTime() ?? Number.NaN;

/** Lists a chain deepest-first, the order that forces one pass per level on a naive fixed point. */
const reverseChain = (length: number): LineageMessage[] =>
  Array.from({ length }, (_, index) => {
    const depth = length - 1 - index;
    return message(`m${depth}`, depth === 0 ? Constants.NO_PARENT : `m${depth - 1}`);
  });

describe('breakParentCycles', () => {
  it('leaves a forest untouched', () => {
    const messages = [
      message('a', Constants.NO_PARENT),
      message('b', 'a'),
      message('c', 'a'),
      message('d', 'missing'),
    ];

    expect(breakParentCycles(messages)).toBe(false);
    expect(messages.map((entry) => entry.parentMessageId)).toEqual([
      Constants.NO_PARENT,
      'a',
      'a',
      'missing',
    ]);
  });

  it('severs the link that closes a two-message cycle', () => {
    const messages = [message('a', 'b'), message('b', 'a')];

    expect(breakParentCycles(messages)).toBe(true);
    expect(messages[0].parentMessageId).toBe(Constants.NO_PARENT);
    expect(messages[1].parentMessageId).toBe('a');
  });

  it('severs a self-parented message', () => {
    const messages = [message('a', 'a')];

    expect(breakParentCycles(messages)).toBe(true);
    expect(messages[0].parentMessageId).toBe(Constants.NO_PARENT);
  });

  it('keeps the tail that leads into a cycle attached to it', () => {
    const messages = [message('tail', 'a'), message('a', 'b'), message('b', 'a')];

    expect(breakParentCycles(messages)).toBe(true);
    expect(messages.map((entry) => entry.parentMessageId)).toEqual(['a', Constants.NO_PARENT, 'a']);
  });
});

describe('orderParentTimestamps', () => {
  it('moves a child that sorts at or before its parent to one millisecond after it', () => {
    const messages = [message('parent', Constants.NO_PARENT, 100), message('child', 'parent', 50)];

    orderParentTimestamps(messages);

    expect(timeOf(messages, 'child')).toBe(BASE + 101);
    expect(timeOf(messages, 'parent')).toBe(BASE + 100);
  });

  it('keeps a child that already sorts after its parent', () => {
    const messages = [message('parent', Constants.NO_PARENT, 100), message('child', 'parent', 500)];

    orderParentTimestamps(messages);

    expect(timeOf(messages, 'child')).toBe(BASE + 500);
  });

  it('cascades through descendants regardless of listing order', () => {
    const messages = [
      message('grandchild', 'child', 0),
      message('child', 'parent', 0),
      message('sibling', 'parent', 300),
      message('parent', Constants.NO_PARENT, 200),
    ];

    orderParentTimestamps(messages);

    expect(timeOf(messages, 'parent')).toBe(BASE + 200);
    expect(timeOf(messages, 'child')).toBe(BASE + 201);
    expect(timeOf(messages, 'grandchild')).toBe(BASE + 202);
    expect(timeOf(messages, 'sibling')).toBe(BASE + 300);
  });

  it('does not adjust a message whose parent is not in the set', () => {
    const messages = [message('orphan', 'missing', 0)];

    orderParentTimestamps(messages);

    expect(timeOf(messages, 'orphan')).toBe(BASE);
  });

  it('does not propagate from an invalid parent timestamp', () => {
    const parent = message('parent', Constants.NO_PARENT);
    parent.createdAt = new Date(Number.NaN);
    const messages = [parent, message('child', 'parent', 0)];

    orderParentTimestamps(messages);

    expect(timeOf(messages, 'child')).toBe(BASE);
  });

  it('orders a deep chain listed deepest-first in a single pass', () => {
    const length = 20_000;
    const messages = reverseChain(length);

    const startedAt = performance.now();
    orderParentTimestamps(messages);
    const elapsedMs = performance.now() - startedAt;

    expect(elapsedMs).toBeLessThan(1000);
    expect(timeOf(messages, 'm0')).toBe(BASE);
    expect(timeOf(messages, `m${length - 1}`)).toBe(BASE + length - 1);
  });
});

describe('orderMessageLineage', () => {
  it('breaks cycles before ordering and reports them once', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);
    const messages = [message('a', 'b', 10), message('b', 'a', 10), message('c', 'b', 0)];

    orderMessageLineage(messages);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('cyclic parent relationships'));
    expect(messages.map((entry) => entry.parentMessageId)).toEqual([Constants.NO_PARENT, 'a', 'b']);
    expect(timeOf(messages, 'a')).toBe(BASE + 10);
    expect(timeOf(messages, 'b')).toBe(BASE + 11);
    expect(timeOf(messages, 'c')).toBe(BASE + 12);
    warn.mockRestore();
  });

  it('stays silent for an acyclic lineage', () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => logger);

    orderMessageLineage(reverseChain(3));

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
