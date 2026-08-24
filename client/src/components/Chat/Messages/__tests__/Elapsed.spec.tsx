import React from 'react';
import { RecoilRoot, type MutableSnapshot } from 'recoil';
import { render, screen, act } from '@testing-library/react';
import Elapsed from '~/components/Chat/Messages/Elapsed';
import store from '~/store';

function renderElapsed(initializeState?: (snapshot: MutableSnapshot) => void) {
  return render(
    <RecoilRoot initializeState={initializeState}>
      <Elapsed index={0} />
    </RecoilRoot>,
  );
}

function advance(ms: number) {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('Elapsed', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders seconds from the submission start anchor and rolls into minutes', () => {
    const start = Date.now() - 5_000;
    renderElapsed(({ set }) => set(store.submissionStartFamily(0), start));

    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^5s$/);

    advance(54_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^59s$/);

    advance(1_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^1m 0s$/);

    advance(59_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^1m 59s$/);

    advance(1_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^2m 0s$/);
  });

  it('counts from mount when no submission start is recorded', () => {
    renderElapsed();

    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^0s$/);

    advance(3_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^3s$/);
  });

  it('clamps a future anchor to zero instead of going negative', () => {
    const start = Date.now() + 60_000;
    renderElapsed(({ set }) => set(store.submissionStartFamily(0), start));

    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^0s$/);

    advance(61_000);
    expect(screen.getByTestId('stream-elapsed')).toHaveTextContent(/^1s$/);
  });

  it('clears its interval on unmount', () => {
    const view = renderElapsed();
    const timersWhileMounted = jest.getTimerCount();
    expect(timersWhileMounted).toBeGreaterThanOrEqual(1);

    view.rerender(<RecoilRoot>{null}</RecoilRoot>);
    expect(jest.getTimerCount()).toBe(timersWhileMounted - 1);
  });
});
