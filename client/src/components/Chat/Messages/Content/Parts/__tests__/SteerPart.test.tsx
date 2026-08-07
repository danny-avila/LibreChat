import React from 'react';
import { RecoilRoot } from 'recoil';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { TMessage } from 'librechat-data-provider';
import SteerPart from '../SteerPart';
import store from '~/store';

let mockShareContext: { isSharedConvo?: boolean; shareId?: string } = {};

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
}));

jest.mock('~/Providers', () => ({
  useShareContext: () => mockShareContext,
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
  default: ({ file, onClick }: { file: { filename?: string }; onClick?: () => void }) => (
    <button type="button" data-testid="steer-file" onClick={onClick}>
      {file.filename}
    </button>
  ),
}));

jest.mock('~/components/Chat/Messages/Content/FilePreviewDialog', () => ({
  __esModule: true,
  default: ({ open, fileName }: { open: boolean; fileName: string }) =>
    open ? <div data-testid="steer-file-preview">{fileName}</div> : null,
}));

jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({ altText }: { altText: string }) => <img alt={altText} data-testid="steer-image" />,
}));

/** Seeds the user atom rather than mocking `useAuthContext`, and renders the real
 *  MessageIcon tree — mocking either one hid a crash on the share route, where
 *  neither an auth context nor a user exists. */
const SEEDED_USER = { name: 'Danny', username: 'danny' };

function renderPart(
  files?: TMessage['files'],
  /** `null` seeds nothing — passing `undefined` would fall back to the default and
   *  silently test the signed-in state instead of the anonymous share route. */
  user: { name: string; username: string } | null = SEEDED_USER,
) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <RecoilRoot initializeState={({ set }) => user && set(store.user, user as never)}>
        <SteerPart steer="steered words" steerId="s1" createdAt={1} files={files} />
      </RecoilRoot>
    </QueryClientProvider>,
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

  it('renders on the share route, where there is no auth context and no user', () => {
    /** Regression for #14474: `/share/:shareId` mounts outside AuthContextProvider,
     *  so any `useAuthContext()` on this tree throws and the whole page is replaced
     *  by the route error boundary. Both SteerPart and the MessageIcon tree it
     *  renders used to call it. */
    mockShareContext = { isSharedConvo: true, shareId: 'share-1' };

    expect(() => renderPart(undefined, null)).not.toThrow();
    expect(screen.getByText('steered words')).toBeInTheDocument();
    expect(screen.getByText('com_user_message')).toBeInTheDocument();
  });

  it('never renders the viewer identity on a shared steer avatar', () => {
    /** The user atom is app-wide and survives navigation, so a signed-in viewer
     *  opening a share link still has an identity in state. The shared steer must
     *  show the generic avatar regardless. */
    mockShareContext = { isSharedConvo: true, shareId: 'share-1' };
    renderPart(undefined, SEEDED_USER);

    expect(screen.queryByTitle('Danny')).toBeNull();
    expect(screen.queryByText('Danny')).toBeNull();
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

  it('reveals on hover/focus on hover-capable pointers but stays visible on touch', () => {
    renderPart();
    // Like the hover buttons: hidden-at-rest ONLY on hover-capable pointers
    // ([@media(hover:hover)]:opacity-0), so touch devices keep it visible.
    const wrapper = screen.getByTestId('steer-info-affordance');
    expect(wrapper.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(wrapper.className).toContain('group-hover:opacity-100');
    expect(wrapper.className).toContain('focus-within:opacity-100');
  });
});

describe('SteerPart presentation', () => {
  beforeEach(() => {
    mockShareContext = {};
  });

  it('presents the steer as a user message with an icon', () => {
    renderPart();
    /** Asserts the real avatar rather than a stubbed one — the previous mock was
     *  what hid the auth-context crash inside this icon tree. */
    expect(screen.getByTitle('Danny')).toBeInTheDocument();
    expect(screen.getByText('steered words')).toBeInTheDocument();
  });

  it('anchors the steer for the message-nav rail', () => {
    renderPart();
    const part = screen.getByTestId('steer-part');
    expect(part).toHaveAttribute('id', 'steer-s1');
    expect(part).toHaveClass('steer-render');
  });

  it('renders steer attachments', () => {
    renderPart([
      { file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' },
      { file_id: 'f2', filename: 'shot.png', type: 'image/png', filepath: '/images/shot.png' },
    ]);
    expect(screen.getByTestId('steer-file')).toHaveTextContent('notes.pdf');
    expect(screen.getByTestId('steer-image')).toBeInTheDocument();
  });

  it('opens the file preview dialog when a non-image steer attachment is clicked', () => {
    renderPart([{ file_id: 'f1', filename: 'notes.pdf', type: 'application/pdf' }]);
    expect(screen.queryByTestId('steer-file-preview')).toBeNull();

    fireEvent.click(screen.getByTestId('steer-file'));
    expect(screen.getByTestId('steer-file-preview')).toHaveTextContent('notes.pdf');
  });
});
