import React from 'react';
import { screen, fireEvent } from '@testing-library/react';
import { render } from 'test/layout-test-utils';
import type { TFile } from 'librechat-data-provider';

// --- mock data (prefixed with `mock` for jest.mock factory access) ---
const mockFetchNextPage = jest.fn();

const mockGalleryState = {
  pages: [] as Array<{ images: TFile[]; nextCursor: string | null }>,
  hasNextPage: false,
  isFetchingNextPage: false,
};

jest.mock('~/data-provider', () => ({
  useImageGallery: () => ({
    data: { pages: mockGalleryState.pages },
    fetchNextPage: mockFetchNextPage,
    hasNextPage: mockGalleryState.hasNextPage,
    isFetchingNextPage: mockGalleryState.isFetchingNextPage,
  }),
  useGetRole: () => ({ data: null }),
  useGetUserQuery: () => ({ data: null }),
  useLoginUserMutation: () => ({ mutate: jest.fn() }),
  useLogoutUserMutation: () => ({ mutate: jest.fn() }),
  useRefreshTokenMutation: () => ({ mutate: jest.fn() }),
}));

jest.mock('~/hooks', () => ({
  useLocalize: () => (key: string) => key,
  useAuthContext: () => ({ isAuthenticated: true, user: { id: 'u1' }, roles: {} }),
}));

jest.mock('@librechat/client', () => {
  const actual = jest.requireActual('@librechat/client');
  return {
    ...actual,
    Button: ({
      children,
      onClick,
      disabled,
      'aria-label': ariaLabel,
      ...rest
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { 'aria-label'?: string }) => (
      <button onClick={onClick} disabled={disabled} aria-label={ariaLabel} {...rest}>
        {children}
      </button>
    ),
  };
});

// Stub the Image component (Chat/Messages/Content/Image) to avoid canvas/fetch issues
jest.mock('~/components/Chat/Messages/Content/Image', () => ({
  __esModule: true,
  default: ({
    imagePath,
    altText,
  }: {
    imagePath: string;
    altText: string;
    args?: object;
    width?: number;
    height?: number;
  }) => <img src={imagePath} alt={altText} data-testid="gallery-thumbnail" />,
}));

function makeFile(overrides: Partial<TFile> = {}): TFile {
  return {
    file_id: 'f1',
    filename: 'cat.png',
    filepath: '/images/cat.png',
    bytes: 1024,
    embedded: false,
    object: 'file',
    type: 'image/png',
    usage: 0,
    user: 'u1',
    ...overrides,
  };
}

import ImageGallery from '../ImageGallery';

describe('ImageGallery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGalleryState.pages = [];
    mockGalleryState.hasNextPage = false;
    mockGalleryState.isFetchingNextPage = false;
  });

  it('renders the section heading', () => {
    render(<ImageGallery />);
    expect(screen.getByText('com_ui_my_images')).toBeInTheDocument();
  });

  it('shows empty state when there are no images', () => {
    render(<ImageGallery />);
    expect(screen.getByText('com_ui_no_images')).toBeInTheDocument();
    expect(screen.queryByTestId('gallery-thumbnail')).not.toBeInTheDocument();
  });

  it('renders thumbnails when images are present', () => {
    mockGalleryState.pages = [
      {
        images: [
          makeFile({ file_id: 'f1', filename: 'cat.png', filepath: '/images/cat.png' }),
          makeFile({ file_id: 'f2', filename: 'dog.png', filepath: '/images/dog.png' }),
        ],
        nextCursor: null,
      },
    ];

    render(<ImageGallery />);

    expect(screen.queryByText('com_ui_no_images')).not.toBeInTheDocument();
    const thumbnails = screen.getAllByTestId('gallery-thumbnail');
    expect(thumbnails).toHaveLength(2);
    expect(thumbnails[0]).toHaveAttribute('src', '/images/cat.png');
    expect(thumbnails[1]).toHaveAttribute('src', '/images/dog.png');
  });

  it('does not render Load more button when hasNextPage is false', () => {
    mockGalleryState.pages = [
      { images: [makeFile()], nextCursor: null },
    ];
    mockGalleryState.hasNextPage = false;

    render(<ImageGallery />);

    expect(screen.queryByRole('button', { name: 'com_ui_load_more' })).not.toBeInTheDocument();
  });

  it('renders Load more button when hasNextPage is true', () => {
    mockGalleryState.pages = [
      { images: [makeFile()], nextCursor: 'cursor-abc' },
    ];
    mockGalleryState.hasNextPage = true;

    render(<ImageGallery />);

    expect(screen.getByRole('button', { name: 'com_ui_load_more' })).toBeInTheDocument();
  });

  it('calls fetchNextPage when Load more is clicked', () => {
    mockGalleryState.pages = [
      { images: [makeFile()], nextCursor: 'cursor-abc' },
    ];
    mockGalleryState.hasNextPage = true;

    render(<ImageGallery />);

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_load_more' }));
    expect(mockFetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('disables Load more while fetching next page', () => {
    mockGalleryState.pages = [
      { images: [makeFile()], nextCursor: 'cursor-abc' },
    ];
    mockGalleryState.hasNextPage = true;
    mockGalleryState.isFetchingNextPage = true;

    render(<ImageGallery />);

    expect(screen.getByRole('button', { name: 'com_ui_load_more' })).toBeDisabled();
  });

  it('flattens images across multiple pages', () => {
    mockGalleryState.pages = [
      {
        images: [makeFile({ file_id: 'f1', filename: 'a.png', filepath: '/images/a.png' })],
        nextCursor: 'c1',
      },
      {
        images: [makeFile({ file_id: 'f2', filename: 'b.png', filepath: '/images/b.png' })],
        nextCursor: null,
      },
    ];

    render(<ImageGallery />);

    expect(screen.getAllByTestId('gallery-thumbnail')).toHaveLength(2);
  });
});
