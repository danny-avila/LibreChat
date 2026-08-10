/**
 * @jest-environment @happy-dom/jest-environment
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { DisableTwoFactorToggle } from '../DisableTwoFactorToggle';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

describe('DisableTwoFactorToggle', () => {
  it('shows a non-interactive policy status when 2FA is required', () => {
    render(<DisableTwoFactorToggle enabled={true} required={true} onChange={jest.fn()} />);

    expect(screen.getByText('com_ui_2fa_required')).toHaveClass('text-text-primary');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('keeps the disable control when the deployment policy is optional', () => {
    render(<DisableTwoFactorToggle enabled={true} required={false} onChange={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'com_ui_2fa_disable' })).toBeInTheDocument();
  });
});
