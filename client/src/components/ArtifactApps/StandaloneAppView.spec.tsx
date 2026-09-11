import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { TArtifactApp, TArtifactVersion } from 'librechat-data-provider';
import {
  useGetArtifactAppQuery,
  useGetArtifactAppVersionQuery,
  useListArtifactAppVersionsQuery,
} from '~/data-provider';
import StandaloneAppView from './StandaloneAppView';

const mockNavigate = jest.fn();
let mockVersionId: string | undefined;

jest.mock('react-router-dom', () => ({
  useParams: () => ({ artifactAppId: 'app-1', versionId: mockVersionId }),
  useNavigate: () => mockNavigate,
}));

jest.mock('~/data-provider', () => ({
  useGetArtifactAppQuery: jest.fn(),
  useGetArtifactAppVersionQuery: jest.fn(),
  useListArtifactAppVersionsQuery: jest.fn(),
}));

jest.mock('~/hooks/useLocalize', () => ({
  __esModule: true,
  default: () => (key: string) => key,
}));

jest.mock('./AppRenderer', () => ({
  __esModule: true,
  default: ({ version }: { version: TArtifactVersion }) => (
    <div data-testid="artifact-renderer">{version.sourceSnapshot}</div>
  ),
}));

const app = {
  artifactAppId: 'app-1',
  activeVersionId: 'version-2',
  title: 'Revenue chart',
  status: 'draft',
} as TArtifactApp;

const version = {
  artifactAppId: 'app-1',
  artifactVersionId: 'version-2',
  versionNumber: 2,
  sourceSnapshot: 'selected snapshot',
} as TArtifactVersion;

describe('StandaloneAppView', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionId = undefined;
    jest.mocked(useGetArtifactAppQuery).mockReturnValue({
      data: app,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetArtifactAppQuery>);
    jest.mocked(useGetArtifactAppVersionQuery).mockReturnValue({
      data: version,
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useGetArtifactAppVersionQuery>);
    jest.mocked(useListArtifactAppVersionsQuery).mockReturnValue({
      data: {
        pages: [
          {
            versions: [
              {
                artifactAppId: 'app-1',
                artifactVersionId: 'version-2',
                versionNumber: 2,
              },
            ],
            has_more: true,
            after: 'next-page',
          },
        ],
        pageParams: [undefined],
      },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage: jest.fn(),
    } as unknown as ReturnType<typeof useListArtifactAppVersionsQuery>);
  });

  it('fetches only the active full snapshot and renders it', () => {
    render(<StandaloneAppView />);

    expect(useGetArtifactAppVersionQuery).toHaveBeenCalledWith('app-1', 'version-2', {
      enabled: true,
    });
    expect(screen.getByTestId('artifact-renderer')).toHaveTextContent('selected snapshot');
  });

  it('loads additional metadata pages on demand', () => {
    const fetchNextPage = jest.fn();
    jest.mocked(useListArtifactAppVersionsQuery).mockReturnValue({
      data: {
        pages: [{ versions: [], has_more: true, after: 'next-page' }],
        pageParams: [undefined],
      },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
    } as unknown as ReturnType<typeof useListArtifactAppVersionsQuery>);

    render(<StandaloneAppView />);
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_load_more' }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});
