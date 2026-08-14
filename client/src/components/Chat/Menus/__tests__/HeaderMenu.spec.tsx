import { render, screen } from '@testing-library/react';
import type { MenuItemProps } from '~/common';

const mockAccess: Record<string, boolean> = {};
const mockHookState = {
  multiConvo: { show: true, addConversation: jest.fn() },
  temporary: { show: true, isTemporary: false, toggle: jest.fn() },
  bookmarks: {
    show: true,
    items: [{ id: 'tag-1', label: 'work' }] as MenuItemProps[],
    bookmarks: [],
    hasBookmarks: false,
    isLoading: false,
    triggerAriaLabel: 'bookmarks',
    dialog: <div data-testid="bookmark-dialog" />,
  },
  exportShare: {
    show: true,
    items: [{ label: 'share' }, { label: 'export' }] as MenuItemProps[],
    hasSharedLink: false,
    dialogs: <div data-testid="export-dialogs" />,
  },
};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useHasAccess: ({ permissionType }: { permissionType: string }) =>
    mockAccess[permissionType] ?? true,
}));

jest.mock('~/hooks/Chat/useMultiConvo', () => ({
  __esModule: true,
  default: () => mockHookState.multiConvo,
}));
jest.mock('~/hooks/Chat/useTemporaryChat', () => ({
  __esModule: true,
  default: () => mockHookState.temporary,
}));
jest.mock('~/hooks/Chat/useBookmarkItems', () => ({
  __esModule: true,
  default: () => mockHookState.bookmarks,
}));
jest.mock('~/hooks/Chat/useExportShare', () => ({
  __esModule: true,
  default: () => mockHookState.exportShare,
}));

/** The real MenuButton needs the MenuProvider that DropdownPopup supplies, which is mocked out below. */
jest.mock('@ariakit/react', () => ({
  MenuButton: ({ children, ...props }: React.ComponentProps<'button'>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@librechat/client', () => ({
  TooltipAnchor: ({ render: node }: { render: React.ReactNode }) => node,
  DropdownPopup: ({ trigger, items }: { trigger: React.ReactNode; items: MenuItemProps[] }) => (
    <div>
      {trigger}
      <ul data-testid="menu-items">
        {items.map((item, index) => (
          <li key={index} data-separate={item.separate === true} data-sub={item.subItems != null}>
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  ),
}));

import HeaderMenu from '../HeaderMenu';

const labels = () =>
  Array.from(screen.getByTestId('menu-items').children).map((node) => node.textContent);

describe('HeaderMenu', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockAccess)) {
      delete mockAccess[key];
    }
    mockHookState.multiConvo.show = true;
    mockHookState.temporary.show = true;
    mockHookState.bookmarks.show = true;
    mockHookState.exportShare.show = true;
  });

  it('collapses every secondary action behind one trigger', () => {
    render(<HeaderMenu />);

    expect(screen.getByTestId('header-overflow-menu')).toBeInTheDocument();
    expect(labels()).toEqual([
      'com_ui_bookmarks',
      'com_ui_add_multi_conversation',
      'share',
      'export',
      'com_ui_temporary',
    ]);
  });

  it('nests bookmarks rather than flattening every tag into the top level', () => {
    render(<HeaderMenu />);

    const bookmarkRow = screen.getByTestId('menu-items').children[0];
    expect(bookmarkRow).toHaveAttribute('data-sub', 'true');
  });

  it('renders nothing when no action survives its gate', () => {
    mockHookState.multiConvo.show = false;
    mockHookState.temporary.show = false;
    mockHookState.bookmarks.show = false;
    mockHookState.exportShare.show = false;

    render(<HeaderMenu />);

    expect(screen.queryByTestId('header-overflow-menu')).not.toBeInTheDocument();
  });

  it('drops actions the user lacks permission for', () => {
    mockAccess.BOOKMARKS = false;
    mockAccess.MULTI_CONVO = false;

    render(<HeaderMenu />);

    expect(labels()).toEqual(['share', 'export', 'com_ui_temporary']);
  });

  it('never opens with a leading separator when earlier groups are gated out', () => {
    mockAccess.BOOKMARKS = false;
    mockAccess.MULTI_CONVO = false;

    render(<HeaderMenu />);

    expect(screen.getByTestId('menu-items').children[0]).toHaveAttribute('data-separate', 'false');
  });

  it('separates the export group from the actions above it', () => {
    render(<HeaderMenu />);

    const rows = screen.getByTestId('menu-items').children;
    expect(rows[2]).toHaveAttribute('data-separate', 'true');
  });
});
