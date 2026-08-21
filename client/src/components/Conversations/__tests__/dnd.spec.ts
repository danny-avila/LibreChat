import { shouldSwapOnHover } from '../dnd';

/** A 36px favorite row and a 48px chat row, the two heights the pinned list
 *  mixes below the `md` breakpoint. */
const row = (top: number, height: number) => ({ hoverTop: top, hoverBottom: top + height });

describe('shouldSwapOnHover', () => {
  it('refuses a hover on the row being dragged', () => {
    expect(shouldSwapOnHover({ dragIndex: 1, hoverIndex: 1, pointerY: 50, ...row(36, 48) })).toBe(
      false,
    );
  });

  it('refuses a hover on a row the list no longer holds', () => {
    expect(shouldSwapOnHover({ dragIndex: -1, hoverIndex: 2, pointerY: 50, ...row(36, 48) })).toBe(
      false,
    );
    expect(shouldSwapOnHover({ dragIndex: 0, hoverIndex: -1, pointerY: 50, ...row(36, 48) })).toBe(
      false,
    );
  });

  it('waits for the midpoint when dragging downwards', () => {
    expect(shouldSwapOnHover({ dragIndex: 0, hoverIndex: 1, pointerY: 40, ...row(36, 48) })).toBe(
      false,
    );
    expect(shouldSwapOnHover({ dragIndex: 0, hoverIndex: 1, pointerY: 62, ...row(36, 48) })).toBe(
      true,
    );
  });

  it('waits for the midpoint when dragging upwards', () => {
    expect(shouldSwapOnHover({ dragIndex: 2, hoverIndex: 1, pointerY: 80, ...row(36, 48) })).toBe(
      false,
    );
    expect(shouldSwapOnHover({ dragIndex: 2, hoverIndex: 1, pointerY: 40, ...row(36, 48) })).toBe(
      true,
    );
  });

  it('does not oscillate once a shorter row has displaced a taller one', () => {
    /* A 36px row dragged onto a 48px row below it. Before the swap the rows sit
     * at 0-36 and 36-84; a pointer at y=40 is inside the taller row's top half,
     * so nothing moves. Swapping there would put the taller row at 0-48, still
     * under the same pointer, and the next hover would swap it straight back. */
    expect(shouldSwapOnHover({ dragIndex: 0, hoverIndex: 1, pointerY: 40, ...row(36, 48) })).toBe(
      false,
    );
    /* After a swap that did clear the midpoint, the displaced row occupies
     * 0-48 and the pointer that caused it sits past its midpoint, which reads
     * as "already ahead of this row" rather than as a reason to swap back. */
    expect(shouldSwapOnHover({ dragIndex: 1, hoverIndex: 0, pointerY: 62, ...row(0, 48) })).toBe(
      false,
    );
  });
});
