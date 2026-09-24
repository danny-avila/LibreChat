import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import ExportAndShareMenu from '../ExportAndShareMenu';

let mockShareId: string | null = null;

jest.mock('recoil', () => ({
  useRecoilValue: () => ({ conversationId: 'conversation-1' }),
}));

jest.mock('librechat-data-provider/react-query', () => ({
  useGetSharedLinkQuery: () => ({ data: { shareId: mockShareId } }),
}));

jest.mock('@ariakit/react', () => ({
  MenuButton: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

jest.mock('@librechat/client', () => ({
  DropdownPopup: ({ trigger }: { trigger: React.ReactNode }) => trigger,
  TooltipAnchor: ({ render }: { render: React.ReactNode }) => render,
  useMediaQuery: () => false,
}));

jest.mock('~/hooks', () => ({
  useHasAccess: () => true,
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/components/Nav/ExportConversation/ExportModal', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Conversations/ConvoOptions', () => ({
  ShareButton: () => null,
}));

jest.mock('~/store', () => ({
  __esModule: true,
  default: { conversationByIndex: () => ({}) },
}));

describe('ExportAndShareMenu link status', () => {
  beforeEach(() => {
    mockShareId = null;
  });

  it('shows a blue circular indicator when the conversation has a link', () => {
    mockShareId = 'share-1';

    render(<ExportAndShareMenu isSharedButtonEnabled={true} />);

    expect(screen.getByTestId('header-shared-link-indicator')).toHaveClass(
      'rounded-full',
      'bg-status-info',
      '-right-0.5',
      '-top-0.5',
      'size-2',
    );
    expect(screen.getByRole('button')).toHaveAttribute(
      'aria-label',
      'com_ui_export_share_link_active',
    );
  });

  it('uses the default share control when the conversation has no link', () => {
    render(<ExportAndShareMenu isSharedButtonEnabled={true} />);

    expect(screen.queryByTestId('header-shared-link-indicator')).not.toBeInTheDocument();
    expect(screen.getByRole('button')).toHaveAttribute('aria-label', 'com_endpoint_export_share');
  });
});
