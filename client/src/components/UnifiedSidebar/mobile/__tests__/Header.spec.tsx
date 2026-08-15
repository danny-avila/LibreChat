import { render, screen } from '@testing-library/react';
import type { NavLink } from '~/common';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutAriaKey: () => 'Meta+Shift+S',
}));

jest.mock('@librechat/client', () => ({
  Button: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
  Skeleton: () => <div data-testid="skeleton" />,
}));

jest.mock('../Switcher', () => ({
  __esModule: true,
  default: () => <div data-testid="panel-switcher" />,
}));

jest.mock('~/components/Nav/AccountSettings', () => ({
  __esModule: true,
  default: () => <div data-testid="nav-user" />,
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => ({
  CLOSE_SIDEBAR_ID: 'close-sidebar-button',
}));

import Header from '../Header';

const links = [] as NavLink[];

describe('mobile drawer header', () => {
  it('claims the close identity while the drawer is open', () => {
    render(<Header links={links} expanded={true} onClose={jest.fn()} />);

    const close = screen.getByTestId('close-sidebar-button');
    expect(close).toHaveAttribute('id', 'close-sidebar-button');
    expect(close).toHaveAttribute('aria-expanded', 'true');
  });

  /**
   * The drawer stays mounted while closed so it can slide, and a translated
   * element still counts as visible — so anything probing for the close button
   * would find one sitting off-viewport and act on it.
   */
  it('gives up that identity once closed', () => {
    render(<Header links={links} expanded={false} onClose={jest.fn()} />);

    expect(screen.queryByTestId('close-sidebar-button')).not.toBeInTheDocument();
    expect(document.getElementById('close-sidebar-button')).toBeNull();
  });

  /** The only close control while open, so its binding must be discoverable here. */
  it('advertises the toggle shortcut on the close control', () => {
    render(<Header links={links} expanded={true} onClose={jest.fn()} />);

    expect(screen.getByTestId('close-sidebar-button')).toHaveAttribute(
      'aria-keyshortcuts',
      'Meta+Shift+S',
    );
  });

  it('keeps the closed drawer out of the tab order', () => {
    render(<Header links={links} expanded={false} onClose={jest.fn()} />);

    expect(screen.getByLabelText('com_nav_close_sidebar')).toHaveAttribute('tabindex', '-1');
  });
});
