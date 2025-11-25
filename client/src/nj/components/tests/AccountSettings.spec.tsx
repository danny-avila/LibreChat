import { render } from 'test/layout-test-utils';
import AccountSettings from '~/components/Nav/AccountSettings';
import { act, screen } from '@testing-library/react';

describe('AccountSettings NJ customizations', () => {
  test('Disabled my files, help & faq, and settings buttons', async () => {
    await act(async () => render(<AccountSettings />));

    const fileButton = screen.queryByText('My Files');
    expect(fileButton).not.toBeInTheDocument();

    const helpAndFaqButton = screen.queryByText('Help & FAQ');
    expect(helpAndFaqButton).not.toBeInTheDocument();

    const settingsButton = screen.queryByText('Settings');
    expect(settingsButton).not.toBeInTheDocument();
  });
});
