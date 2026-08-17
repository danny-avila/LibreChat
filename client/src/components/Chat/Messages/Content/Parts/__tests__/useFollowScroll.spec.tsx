import React from 'react';
import { render, fireEvent } from '@testing-library/react';
import useFollowScroll from '../useFollowScroll';

function Probe({ content, active }: { content: string; active: boolean }) {
  const { ref, onScroll } = useFollowScroll<HTMLDivElement>(content, active);
  return (
    <div data-testid="pane" ref={ref} onScroll={onScroll}>
      {content}
    </div>
  );
}

/**
 * jsdom has no layout, so scroll geometry is stubbed: `scrollHeight` reads
 * from mutable state (grown by the test as content streams) and every
 * `scrollTop` write the hook makes is recorded. Direct mutations of the
 * returned state bypass the element setter, so `writes` only ever contains
 * scrolls the hook itself performed.
 */
const mockScrollMetrics = (el: HTMLElement, clientHeight: number) => {
  const state = { scrollHeight: 0, scrollTop: 0, writes: [] as number[] };
  Object.defineProperty(el, 'scrollHeight', { configurable: true, get: () => state.scrollHeight });
  Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => clientHeight });
  Object.defineProperty(el, 'scrollTop', {
    configurable: true,
    get: () => state.scrollTop,
    set: (value: number) => {
      state.scrollTop = value;
      state.writes.push(value);
    },
  });
  return state;
};

describe('useFollowScroll', () => {
  const setup = (active = true) => {
    const utils = render(<Probe content="a" active={active} />);
    const pane = utils.getByTestId('pane');
    const state = mockScrollMetrics(pane, 300);
    state.scrollHeight = 900;
    return { ...utils, pane, state };
  };

  it('pins to the bottom when content changes while active', () => {
    const { rerender, state } = setup();
    rerender(<Probe content="ab" active />);
    expect(state.scrollTop).toBe(900);
  });

  it('re-pins on every delta as the content keeps growing', () => {
    const { rerender, state } = setup();
    rerender(<Probe content="ab" active />);
    state.scrollHeight = 1200;
    rerender(<Probe content="abc" active />);
    expect(state.scrollTop).toBe(1200);
  });

  it('never scrolls while inactive', () => {
    const { rerender, state } = setup(false);
    rerender(<Probe content="ab" active={false} />);
    expect(state.writes).toHaveLength(0);
  });

  it('stops pinning once the stream ends', () => {
    const { rerender, state } = setup();
    rerender(<Probe content="ab" active />);
    expect(state.writes).toEqual([900]);
    rerender(<Probe content="ab" active={false} />);
    expect(state.writes).toEqual([900]);
  });

  it('detaches when the user scrolls up beyond the follow threshold', () => {
    const { rerender, pane, state } = setup();
    state.scrollTop = 100;
    fireEvent.scroll(pane);
    rerender(<Probe content="ab" active />);
    expect(state.writes).toHaveLength(0);
  });

  it('stays attached at exactly the threshold distance', () => {
    const { rerender, pane, state } = setup();
    state.scrollTop = 560;
    fireEvent.scroll(pane);
    rerender(<Probe content="ab" active />);
    expect(state.scrollTop).toBe(900);
  });

  it('re-attaches when the user returns to the bottom', () => {
    const { rerender, pane, state } = setup();
    state.scrollTop = 100;
    fireEvent.scroll(pane);
    rerender(<Probe content="ab" active />);
    expect(state.writes).toHaveLength(0);
    state.scrollTop = 590;
    fireEvent.scroll(pane);
    rerender(<Probe content="abc" active />);
    expect(state.writes).toEqual([900]);
  });
});
