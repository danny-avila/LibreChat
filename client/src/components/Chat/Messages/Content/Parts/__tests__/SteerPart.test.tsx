import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen } from '@testing-library/react';
import SteerPart from '../SteerPart';

let mockShareContext: { isSharedConvo?: boolean; shareId?: string } = {};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/hooks/AuthContext', () => ({
  useAuthContext: () => ({ user: { name: 'Danny', username: 'danny' } }),
}));

jest.mock('~/Providers', () => ({
  useShareContext: () => mockShareContext,
}));

jest.mock('~/components/Chat/Messages/MessageIcon', () => ({
  __esModule: true,
  default: () => <div data-testid="user-icon" />,
}));

jest.mock('~/components/Chat/Messages/ui/MessageTimestamp', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Chat/Messages/Content/MarkdownLite', () => ({
  __esModule: true,
  default: ({ content }: { content: string }) => <span>{content}</span>,
}));

jest.mock('~/components/Chat/Input/Files/FileContainer', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: () => null,
}));

function renderPart() {
  return render(
    <RecoilRoot>
      <SteerPart steer="steered words" steerId="s1" createdAt={1} />
    </RecoilRoot>,
  );
}

describe('SteerPart author label', () => {
  beforeEach(() => {
    mockShareContext = {};
  });

  it('labels with the logged-in user name in the owner view (username display on)', () => {
    renderPart();
    expect(screen.getByText('Danny')).toBeInTheDocument();
    expect(screen.queryByText('com_user_message')).toBeNull();
  });

  it('labels with the generic user message in the share view, never the viewer identity', () => {
    mockShareContext = { isSharedConvo: true, shareId: 'share-1' };
    renderPart();
    expect(screen.queryByText('Danny')).toBeNull();
    expect(screen.getByText('com_user_message')).toBeInTheDocument();
  });

  it('shows a subtle info affordance explaining the mid-run message', () => {
    renderPart();
    // The "?" InfoHoverCard clarifies why a user message appears inside the
    // assistant response (its text is the trigger's accessible label).
    expect(screen.getByLabelText('com_ui_steered_info')).toBeInTheDocument();
  });
});
