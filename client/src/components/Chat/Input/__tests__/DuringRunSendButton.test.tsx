import React from 'react';
import { RecoilRoot } from 'recoil';
import { useForm } from 'react-hook-form';
import { render, screen, fireEvent } from '@testing-library/react';
import type { SteeringControls } from '~/hooks/Chat/useSteering';
import DuringRunSendButton from '../DuringRunSendButton';
import store from '~/store';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

/**
 * Renders the hovercard eagerly. Ariakit's real show path depends on pointer
 * geometry, which jsdom reports as zeros — driving it from a test asserts
 * Ariakit's hover behavior rather than which rows this component disables.
 */
jest.mock('@ariakit/react', () => ({
  HovercardProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  HovercardAnchor: ({ render }: { render: React.ReactElement }) => render,
  Hovercard: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const TEXT = 'stop, do not run that command';

const mockInterruptSteer = jest.fn(() => true);
const mockSteerFromComposer = jest.fn(() => true);
const mockOnConsumed = jest.fn();

type StubOptions = {
  pausedOnApproval?: boolean;
  canSteer?: boolean;
};

const steeringStub = ({ pausedOnApproval = false, canSteer = true }: StubOptions) =>
  ({
    effectiveAction: canSteer ? 'steer' : 'queue',
    canSteer,
    pausedOnApproval,
    interruptSteer: mockInterruptSteer,
    steerFromComposer: mockSteerFromComposer,
    queueFromComposer: jest.fn(() => true),
    interruptAndSend: jest.fn(() => true),
  }) as unknown as SteeringControls;

function Harness({ steering }: { steering: SteeringControls }) {
  const methods = useForm<{ text: string }>({ defaultValues: { text: TEXT } });
  return (
    <DuringRunSendButton
      control={methods.control}
      steering={steering}
      getText={() => TEXT}
      onConsumed={mockOnConsumed}
    />
  );
}

function openMenu(options: StubOptions & { enterInterrupts?: boolean } = {}) {
  const { enterInterrupts = false, ...stub } = options;
  render(
    <RecoilRoot initializeState={({ set }) => set(store.steerInterruptsByDefault, enterInterrupts)}>
      <Harness steering={steeringStub(stub)} />
    </RecoilRoot>,
  );
  expect(screen.getByText('com_ui_interrupt_steer')).toBeInTheDocument();
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DuringRunSendButton — Interrupt & steer availability', () => {
  /**
   * `useSteering.interruptSteer` hard-refuses while a run is paused for tool
   * approval, so a live row would silently do nothing at exactly the moment a
   * user is trying to stop a tool call.
   */
  test('disables Interrupt & steer while the run is paused on tool approval', () => {
    openMenu({ pausedOnApproval: true, canSteer: false });

    const row = screen.getByText('com_ui_interrupt_steer').closest('button');
    expect(row).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(row as HTMLButtonElement);
    expect(mockInterruptSteer).not.toHaveBeenCalled();
    expect(mockOnConsumed).not.toHaveBeenCalled();
  });

  /**
   * Guards the gate against being "simplified" to `!canSteer` like the steer
   * row above it. `canSteer` is also false before a conversation exists, where
   * `interruptSteer` deliberately falls back to interrupt & send — disabling
   * the row there would make it dead for the whole first turn.
   */
  test('keeps Interrupt & steer live before a conversation exists', () => {
    openMenu({ pausedOnApproval: false, canSteer: false });

    const row = screen.getByText('com_ui_interrupt_steer').closest('button');
    expect(row).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(row as HTMLButtonElement);
    expect(mockInterruptSteer).toHaveBeenCalledWith(TEXT);
    expect(mockOnConsumed).toHaveBeenCalled();
  });

  test('the ordinary Steer row stays gated on canSteer', () => {
    openMenu({ pausedOnApproval: false, canSteer: false });

    const row = screen.getByText('com_ui_steer').closest('button');
    expect(row).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(row as HTMLButtonElement);
    expect(mockSteerFromComposer).not.toHaveBeenCalled();
  });

  test('both actions are available during a normal run', () => {
    openMenu({ pausedOnApproval: false, canSteer: true });

    expect(screen.getByText('com_ui_interrupt_steer').closest('button')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
    expect(screen.getByText('com_ui_steer').closest('button')).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });
});

/**
 * With `steerInterruptsByDefault` on, plain Enter routes through
 * `submitDuringRun` and PREEMPTS, while the ordinary Steer row deliberately
 * stays non-preempting when clicked. The ⏎ hint therefore cannot sit on the
 * Steer row — it would advertise a key that does something else.
 */
describe('DuringRunSendButton — Enter hint follows the interrupt preference', () => {
  const kbdFor = (label: string) =>
    screen.getByText(label).closest('button')?.querySelector('kbd')?.textContent ?? null;

  test('Enter is advertised on Steer when the preference is off', () => {
    openMenu({ canSteer: true, enterInterrupts: false });
    expect(kbdFor('com_ui_steer')).toBe('⏎');
    expect(kbdFor('com_ui_interrupt_steer')).not.toBe('⏎');
  });

  test('Enter moves to Interrupt & steer when the preference is on', () => {
    openMenu({ canSteer: true, enterInterrupts: true });
    expect(kbdFor('com_ui_interrupt_steer')).toBe('⏎');
    /** No key reaches the plain Steer row in this mode, so it advertises none. */
    expect(kbdFor('com_ui_steer')).toBeNull();
  });
});
