import { render, screen } from '@testing-library/react';

jest.mock('recoil', () => ({
  useRecoilValue: () => false,
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => false,
}));

jest.mock('~/data-provider', () => ({
  useGetStartupConfig: () => ({ data: undefined }),
}));

jest.mock('~/utils', () => ({
  cn: (...classes: unknown[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { sidebarExpanded: 'sidebarExpanded' },
}));

jest.mock('../Menus', () => ({
  OpenSidebar: () => <div data-testid="open-sidebar" />,
  PresetsMenu: () => <div data-testid="presets" />,
  NewChat: () => <div data-testid="new-chat" />,
  HeaderMenu: () => <div data-testid="header-menu" />,
}));

jest.mock('../Menus/Endpoints/ModelSelector', () => ({
  __esModule: true,
  default: () => <div data-testid="model-selector" />,
}));

jest.mock('../ExportAndShareMenu', () => ({
  __esModule: true,
  default: () => <div data-testid="export-share" />,
}));

jest.mock('../Menus/BookmarkMenu', () => ({
  __esModule: true,
  default: () => <div data-testid="bookmarks" />,
}));

jest.mock('../TemporaryChat', () => ({
  TemporaryChat: () => <div data-testid="temporary" />,
}));

jest.mock('../AddMultiConvo', () => ({
  __esModule: true,
  default: () => <div data-testid="multi-convo" />,
}));

import Header from '../Header';

describe('chat header layout', () => {
  /**
   * `ModelSelector` is `w-full max-w-md`, so it fills whatever it is given. A
   * centre zone that grows on desktop stretches a short model name to 448px
   * instead of letting it size to its content.
   */
  it('only lets the centre zone grow on mobile', () => {
    render(<Header />);

    const centre = screen.getByTestId('model-selector').parentElement;

    expect(centre).toHaveClass('max-md:flex-1');
    expect(centre).not.toHaveClass('flex-1');
  });

  /**
   * Growing and shrinking are separate decisions. In a pane narrower than the
   * viewport — expanded sidebar, open artifacts panel — the zone must still
   * yield space, or the trailing controls are pushed outside and clipped.
   */
  it('still lets the centre zone shrink at every width', () => {
    render(<Header />);

    expect(screen.getByTestId('model-selector').parentElement).toHaveClass('min-w-0');
  });

  it('holds the trailing cluster to the edge without a growing centre', () => {
    render(<Header />);

    const trailing = screen.getByTestId('header-menu').parentElement;

    expect(trailing).toHaveClass('md:ml-auto', 'flex-shrink-0');
  });

  it('keeps the row from becoming a horizontal scroller again', () => {
    const { container } = render(<Header />);

    expect(container.querySelector('.overflow-x-auto')).toBeNull();
  });
});
