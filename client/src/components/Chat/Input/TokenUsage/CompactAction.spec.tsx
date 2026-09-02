import '@testing-library/jest-dom/extend-expect';
import { render, screen } from '@testing-library/react';
import CompactAction from './CompactAction';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('CompactAction', () => {
  it('confirms that compaction was requested while the mutation is pending', () => {
    render(<CompactAction compact={jest.fn()} canCompact={false} isCompacting />);

    const button = screen.getByRole('button', {
      name: 'com_ui_context_compaction_requested',
    });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });
});
