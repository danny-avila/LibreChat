import { useEffect } from 'react';
import { Provider } from 'jotai';
import * as RadixToast from '@radix-ui/react-toast';
import { render, act, fireEvent } from '@testing-library/react';
import { useToast } from '~/hooks';
import { Toast } from '../Toast';

const MESSAGE = 'The file is too large.';

function ShowOnMount({ duration }: { duration?: number }): null {
  const { showToast } = useToast(0);

  useEffect(() => {
    showToast({ message: MESSAGE, duration });
  }, []);

  return null;
}

function setup(duration?: number): void {
  render(
    <Provider>
      <RadixToast.Provider>
        <ShowOnMount duration={duration} />
        <Toast />
        <RadixToast.Viewport />
      </RadixToast.Provider>
    </Provider>,
  );
}

/** Radix removes the root once it has closed, so an absent node and a node
 *  marked closed are the same observable outcome. */
function state(): string {
  return document.querySelector('.toast-root')?.getAttribute('data-state') ?? 'unmounted';
}

function advance(ms: number): void {
  act(() => {
    jest.advanceTimersByTime(ms);
  });
}

describe('Toast duration', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('honors a duration shorter than the Radix default', () => {
    setup(3000);
    advance(0);
    expect(state()).toBe('open');

    advance(2900);
    expect(state()).toBe('open');

    advance(200);
    expect(state()).not.toBe('open');
  });

  test('honors a duration longer than the Radix default', () => {
    setup(10000);
    advance(0);
    expect(state()).toBe('open');

    advance(5500);
    expect(state()).toBe('open');
  });

  test('treats a duration of 0 as persistent', () => {
    setup(0);
    advance(0);
    expect(state()).toBe('open');

    advance(60000);
    expect(state()).toBe('open');
  });

  test('offers a dismissal only for a persistent toast', () => {
    setup(0);
    advance(0);

    const close = document.querySelector('[aria-label="com_ui_close"]');
    expect(close).not.toBeNull();

    act(() => {
      fireEvent.click(close as Element);
    });

    expect(state()).not.toBe('open');
  });

  test('leaves a self-dismissing toast without a close control', () => {
    setup(3000);
    advance(0);

    expect(document.querySelector('[aria-label="com_ui_close"]')).toBeNull();
  });
});
