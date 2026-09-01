import { fireEvent, render, screen } from '@testing-library/react';
import { RecorderInfo, RecorderPill, useShortcutRecorder } from '../ShortcutRecorder';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

function Harness() {
  const state = useShortcutRecorder({
    initial: null,
    bindingMap: new Map(),
    ownerId: 'test-action',
    getActionLabel: (id) => id,
    onSave: jest.fn(),
    onCancel: jest.fn(),
  });

  return (
    <>
      <RecorderPill state={state} ariaLabel="Shortcut recorder" ownerId="test-action" />
      <RecorderInfo
        state={state}
        ownerId="test-action"
        onCancel={jest.fn()}
        onSaveReplacing={jest.fn()}
      />
    </>
  );
}

describe('ShortcutRecorder', () => {
  it('uses semantic destructive roles when a shortcut has no modifier', () => {
    render(<Harness />);

    const recorder = screen.getByRole('textbox', { name: 'Shortcut recorder' });
    fireEvent.keyDown(recorder, { key: 'a' });

    expect(recorder).toHaveClass('border-border-destructive');
    expect(screen.getByText('com_shortcut_recorder_needs_modifier')).toHaveClass(
      'text-text-destructive',
    );
  });
});
