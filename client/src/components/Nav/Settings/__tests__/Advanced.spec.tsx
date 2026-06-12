/* eslint-disable i18next/no-literal-string */
import userEvent from '@testing-library/user-event';
import { render, screen } from 'test/layout-test-utils';
import Advanced from '../Advanced';

describe('Advanced disclosure', () => {
  it('is collapsed by default and expands on click', async () => {
    render(
      <Advanced label="Advanced" count={2}>
        <div>hidden-child</div>
      </Advanced>,
    );
    const trigger = screen.getByRole('button', { name: /advanced/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('hidden-child')).not.toBeInTheDocument();

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('hidden-child')).toBeInTheDocument();
  });
});
