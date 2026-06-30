import type { ReactNode } from 'react';
import '@testing-library/jest-dom/extend-expect';
import { render, screen, fireEvent } from '@testing-library/react';
import McpOAuthDialog from '../McpOAuthDialog';

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useCopyToClipboard: () => jest.fn(),
}));

jest.mock('@librechat/client', () => {
  const React = jest.requireActual('react');
  const Pass = ({ children }: { children?: ReactNode }) =>
    React.createElement('div', null, children);
  return {
    OGDialog: ({ open, children }: { open: boolean; children: ReactNode }) =>
      open ? React.createElement('div', null, children) : null,
    OGDialogContent: Pass,
    OGDialogTitle: Pass,
    OGDialogDescription: Pass,
    Button: ({
      children,
      onClick,
      'aria-label': ariaLabel,
    }: {
      children?: ReactNode;
      onClick?: () => void;
      'aria-label'?: string;
    }) =>
      React.createElement('button', { type: 'button', onClick, 'aria-label': ariaLabel }, children),
  };
});

const baseProps = {
  open: true,
  onOpenChange: jest.fn(),
  serverName: 'srv',
  oauthUrl: 'https://oauth.example/authorize?x=1',
  canCancel: false,
  onCancel: jest.fn(),
};

describe('McpOAuthDialog', () => {
  test('renders the continue button, the copyable URL, and a QR code', () => {
    render(<McpOAuthDialog {...baseProps} />);
    expect(screen.getByText('com_ui_continue_oauth')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-oauth-url')).toHaveTextContent(baseProps.oauthUrl);
    expect(screen.getByText('com_ui_mcp_oauth_scan_qr')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  test('Continue opens the OAuth URL in a new tab', () => {
    const openSpy = jest.spyOn(window, 'open').mockImplementation(() => null);
    render(<McpOAuthDialog {...baseProps} />);
    fireEvent.click(screen.getByText('com_ui_continue_oauth'));
    expect(openSpy).toHaveBeenCalledWith(baseProps.oauthUrl, '_blank', 'noopener,noreferrer');
    openSpy.mockRestore();
  });

  test('shows a Cancel action only when cancellable', () => {
    const { rerender } = render(<McpOAuthDialog {...baseProps} canCancel={false} />);
    expect(screen.queryByText('com_ui_cancel')).not.toBeInTheDocument();
    rerender(<McpOAuthDialog {...baseProps} canCancel={true} />);
    expect(screen.getByText('com_ui_cancel')).toBeInTheDocument();
  });

  test('renders nothing without an OAuth URL', () => {
    const { container } = render(<McpOAuthDialog {...baseProps} oauthUrl="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
