import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import Loading from '../Loading';

const mockSetSidebarOpen = jest.fn(() => 'mobile');

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));
jest.mock('~/hooks/Nav/useSidebarToggle', () => ({
  __esModule: true,
  default: () => ({ setSidebarOpen: mockSetSidebarOpen }),
}));
jest.mock('~/hooks/useKeyboardShortcuts', () => ({
  useShortcutAriaKey: () => 'Control+b',
  useShortcutHint: (_id: string, label: string) => label,
}));

describe('Loading chat frame', () => {
  it('announces loading once and hides decorative placeholders from assistive technology', () => {
    render(<Loading />);
    expect(screen.getByRole('status')).toHaveTextContent('com_ui_loading');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('main')).toHaveClass('bg-presentation');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByRole('status').querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('offers the existing sidebar action without conversation-dependent controls', () => {
    render(<Loading />);
    const button = screen.getByRole('button', { name: 'com_nav_open_sidebar' });
    expect(button).toHaveAttribute('data-testid', 'header-open-sidebar-button');
    expect(button).toHaveAttribute('aria-controls', 'chat-history-nav');
    expect(button.parentElement).toHaveClass('md:hidden');
    fireEvent.click(button);
    expect(mockSetSidebarOpen).toHaveBeenCalledWith(true);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
