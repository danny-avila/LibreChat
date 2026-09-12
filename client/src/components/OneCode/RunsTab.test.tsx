import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RunsTab from './RunsTab';

describe('RunsTab', () => {
  const run = {
    run_id: 'run-1',
    status: 'halted',
    next_action: 'resume',
    delivery_status: 'partial',
    checkpoint_count: 1,
  };

  it('uses native buttons for inspect, copy and resume keyboard actions', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    const onInspect = jest.fn();
    const onResume = jest.fn();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    });
    render(<RunsTab runs={[run]} onSelect={onSelect} onInspect={onInspect} onResume={onResume} />);

    const inspect = screen.getByRole('button', { name: 'inspect' });
    inspect.focus();
    await user.keyboard('{Enter}');
    expect(onInspect).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();

    const copy = screen.getByRole('button', { name: 'copy' });
    copy.focus();
    await user.keyboard(' ');
    expect(writeText).toHaveBeenCalledWith('run-1');
    expect(onSelect).not.toHaveBeenCalled();

    const resume = screen.getByRole('button', { name: 'resume' });
    resume.focus();
    await user.keyboard('{Enter}');
    expect(onResume).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('selects a run through its summary button', async () => {
    const user = userEvent.setup();
    const onSelect = jest.fn();
    render(<RunsTab runs={[run]} onSelect={onSelect} onInspect={jest.fn()} onResume={jest.fn()} />);
    await user.click(screen.getByRole('button', { name: /run-1/ }));
    expect(onSelect).toHaveBeenCalledWith(run);
  });
});
