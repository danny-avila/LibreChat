import React from 'react';
import { render, fireEvent } from '@testing-library/react';

jest.mock('~/hooks', () => ({
  useLocalize:
    () =>
    (key: string, opts?: Record<string, string | number>): string =>
      opts ? `${key}|${JSON.stringify(opts)}` : key,
}));

jest.mock('~/utils', () => ({ cn: (...a: unknown[]) => a.filter(Boolean).join(' ') }));

import SearchNav, { type SearchNavEntry } from '../SearchNav';
/** The rail's geometry is shared with the transcript's nav; it lives in the one
 *  module both surfaces render. */
import { magnifyFalloff, ribDimsFor } from '../Rail';

/** The rail pins an origin rib above the scrolling column, so a nav-wide
 *  `[data-msg-id]` sweep no longer means "the result ribs". */
function resultRibs(container: HTMLElement): HTMLElement[] {
  const column = container.querySelector('[data-message-nav-column]');
  return Array.from(column?.querySelectorAll<HTMLElement>('[data-msg-id]') ?? []);
}

function makeEntry(over: Partial<SearchNavEntry> & { index: number }): SearchNavEntry {
  return {
    id: `m${over.index}`,
    isUser: over.index % 2 === 0,
    isEnd: false,
    preview: `preview ${over.index}`,
    ...over,
  };
}

function makeEntries(count: number): SearchNavEntry[] {
  return Array.from({ length: count }, (_, i) => makeEntry({ index: i }));
}

describe('SearchNav pure helpers', () => {
  describe('magnifyFalloff', () => {
    it('peaks at the pointer and decays to zero at/after the influence radius', () => {
      expect(magnifyFalloff(0, 50)).toBeCloseTo(1);
      expect(magnifyFalloff(50, 50)).toBe(0);
      expect(magnifyFalloff(100, 50)).toBe(0);
    });

    it('decreases monotonically with distance within the radius', () => {
      const near = magnifyFalloff(10, 50);
      const mid = magnifyFalloff(25, 50);
      const far = magnifyFalloff(40, 50);
      expect(near).toBeGreaterThan(mid);
      expect(mid).toBeGreaterThan(far);
    });
  });

  describe('ribDimsFor', () => {
    it('returns the small square dims for an end marker and the bar dims otherwise', () => {
      const message = ribDimsFor(makeEntry({ index: 0 }));
      const end = ribDimsFor(makeEntry({ index: 1, isEnd: true }));
      expect(message.peakW).toBeGreaterThan(message.baseW);
      expect(message.baseW).toBeGreaterThan(end.baseW);
      expect(end.baseW).toBe(end.baseH);
      expect(end.peakW).toBe(end.peakH);
    });
  });
});

describe('SearchNav rendering', () => {
  const noop = () => {};

  it('renders nothing with fewer than 3 entries', () => {
    const { container } = render(
      <SearchNav
        entries={makeEntries(2)}
        currentIndex={0}
        visibleIndices={new Set([0])}
        onJump={noop}
      />,
    );
    expect(container.querySelector('nav')).toBeNull();
  });

  it('renders one indicator per entry when there are 3+ entries', () => {
    const { container } = render(
      <SearchNav
        entries={makeEntries(4)}
        currentIndex={0}
        visibleIndices={new Set([0, 1])}
        onJump={noop}
      />,
    );
    const nav = container.querySelector('nav');
    expect(nav).not.toBeNull();
    const indicators = resultRibs(container);
    expect(indicators).toHaveLength(4);
    expect(indicators.map((el) => el.getAttribute('data-msg-id'))).toEqual([
      'm0',
      'm1',
      'm2',
      'm3',
    ]);
  });

  it('pins an origin rib above the column that jumps to the first result', () => {
    const onJump = jest.fn();
    const { container } = render(
      <SearchNav
        entries={makeEntries(4)}
        currentIndex={2}
        visibleIndices={new Set([2])}
        onJump={onJump}
      />,
    );
    const origin = container.querySelector('[data-msg-id="search-results-start"]') as HTMLElement;
    expect(origin).not.toBeNull();
    expect(
      container.querySelector('[data-message-nav-column] [data-msg-id="search-results-start"]'),
    ).toBeNull();
    fireEvent.click(origin);
    expect(onJump).toHaveBeenCalledWith(0, true);
  });

  it('gives every result rib a fixed row height so the column cannot compress them', () => {
    const { container } = render(
      <SearchNav
        entries={makeEntries(6)}
        currentIndex={0}
        visibleIndices={new Set([0])}
        onJump={noop}
      />,
    );
    for (const rib of resultRibs(container)) {
      expect(rib.className).toContain('shrink-0');
      expect(rib.style.height).toBe('6px');
    }
  });

  it('scans the result list once per window change, not once per derived value', () => {
    // A new `visibleIndices` set arrives on every change to the virtualized
    // window, so this is the scrolling path; its cost grows with every page
    // fetched. Counting membership probes is the cheapest way to see a second
    // full pass reappear.
    const entries = makeEntries(200);
    let probes = 0;
    const counting = {
      has(index: number) {
        probes++;
        return index >= 40 && index <= 60;
      },
    } as unknown as Set<number>;

    render(
      <SearchNav entries={entries} currentIndex={50} visibleIndices={counting} onJump={noop} />,
    );

    /** One pass over the results, not one per derived value. */
    expect(probes).toBe(entries.length);
  });

  it('puts exactly one result rib in the tab order', () => {
    const { container } = render(
      <SearchNav
        entries={makeEntries(6)}
        currentIndex={3}
        visibleIndices={new Set([3])}
        onJump={noop}
      />,
    );
    const stops = resultRibs(container).filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
    expect(stops[0].getAttribute('data-msg-id')).toBe('m3');
  });

  it('marks aria-current on the entry whose index matches currentIndex', () => {
    const { container } = render(
      <SearchNav
        entries={makeEntries(4)}
        currentIndex={2}
        visibleIndices={new Set([2])}
        onJump={noop}
      />,
    );
    const current = container.querySelectorAll('[aria-current="true"]');
    expect(current).toHaveLength(1);
    expect(current[0].getAttribute('data-msg-id')).toBe('m2');
  });

  it('calls onJump(index, true) when an indicator is clicked', () => {
    const onJump = jest.fn();
    const { container } = render(
      <SearchNav
        entries={makeEntries(4)}
        currentIndex={0}
        visibleIndices={new Set([0])}
        onJump={onJump}
      />,
    );
    const target = container.querySelector('[data-msg-id="m2"]') as HTMLElement;
    fireEvent.click(target);
    expect(onJump).toHaveBeenCalledWith(2, true);
  });

  it('renders without throwing in jsdom even though layout rects are zero', () => {
    expect(() =>
      render(
        <SearchNav
          entries={makeEntries(5)}
          currentIndex={1}
          visibleIndices={new Set([1, 2, 3])}
          onJump={noop}
        />,
      ),
    ).not.toThrow();
  });

  it('counts a trailing end entry against the 3-message threshold (still hidden)', () => {
    const entries = [
      makeEntry({ index: 0 }),
      makeEntry({ index: 1 }),
      { id: 'end', index: 1, isUser: false, isEnd: true, preview: '' },
    ];
    const { container } = render(
      <SearchNav entries={entries} currentIndex={0} visibleIndices={new Set([0])} onJump={noop} />,
    );
    expect(container.querySelector('nav')).toBeNull();
  });
});
