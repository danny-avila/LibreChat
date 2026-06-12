/* eslint-disable i18next/no-literal-string */
import userEvent from '@testing-library/user-event';
import { render, screen } from 'test/layout-test-utils';
import { SettingsDialog } from '../index';

jest.mock('../Content', () =>
  jest.fn(({ query }: { activeTab: string; query: string; ctx: unknown }) =>
    query.trim() ? (
      <div aria-label="Search results" aria-live="polite" />
    ) : (
      <div>
        <h3>Appearance</h3>
      </div>
    ),
  ),
);

describe('SettingsDialog', () => {
  it('renders the General tab by default with its sections', () => {
    render(<SettingsDialog open onOpenChange={jest.fn()} />);
    expect(screen.getByRole('heading', { name: /settings/i, level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Appearance')).toBeInTheDocument();
  });

  it('switches to search results when typing a query', async () => {
    render(<SettingsDialog open onOpenChange={jest.fn()} />);
    await userEvent.type(screen.getByRole('searchbox'), 'language');
    expect(await screen.findByLabelText('Search results')).toBeInTheDocument();
  });
});
