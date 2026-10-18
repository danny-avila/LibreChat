import { fireEvent, render, screen } from '@testing-library/react';
import { InfoBanner } from '../InfoBanner';

jest.mock('~/admin/hooks/useLocalize', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/admin/ui', () => ({
  Icon: ({ name, ...props }: { name: string } & Record<string, unknown>) => (
    <svg role="img" aria-label={name} {...props} />
  ),
}));

jest.mock('~/admin/router', () => ({
  ...jest.requireActual('~/admin/router'),
  Link: ({
    to,
    search,
    children,
  }: {
    to: string;
    search: Record<string, string>;
    children: React.ReactNode;
  }) => <a href={`${to}?${new URLSearchParams(search).toString()}`}>{children}</a>,
}));

const STORAGE_KEY = 'librechat-admin:dismissed:section:interface';

afterEach(() => {
  localStorage.clear();
  jest.restoreAllMocks();
});

describe('InfoBanner', () => {
  it('shows a visible icon, the text and an in-app link', () => {
    render(
      <InfoBanner
        text="Permissions are managed per role."
        link={{
          to: '/access',
          search: { tab: 'roles' },
          labelKey: 'com_admin_config_ui_permissions_link',
        }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('Permissions are managed per role.');
    expect(
      screen.getByRole('link', { name: 'com_admin_config_ui_permissions_link' }),
    ).toHaveAttribute('href', '/access?tab=roles');
    expect(screen.getByRole('note').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('remembers a dismissal across mounts when given a key', () => {
    const { unmount } = render(<InfoBanner text="Hello" dismissKey="section:interface" />);
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_dismiss' }));
    expect(screen.queryByRole('note')).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY)).toBe('1');
    unmount();
    render(<InfoBanner text="Hello" dismissKey="section:interface" />);
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('still dismisses when storage throws', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<InfoBanner text="Hello" dismissKey="section:interface" />);
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_dismiss' }));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('without a key, dismissal resets when the text changes and nothing is stored', () => {
    const { rerender } = render(<InfoBanner text="First" />);
    fireEvent.click(screen.getByRole('button', { name: 'com_admin_ui_dismiss' }));
    expect(screen.queryByRole('note')).toBeNull();
    rerender(<InfoBanner text="Second" />);
    expect(screen.getByRole('note')).toHaveTextContent('Second');
    expect(localStorage.length).toBe(0);
  });

  it('has no dismiss button when not dismissible', () => {
    render(<InfoBanner text="Read-only section" dismissible={false} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
