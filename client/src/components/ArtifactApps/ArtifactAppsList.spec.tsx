import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useSetRecoilState } from 'recoil';
import type { TArtifactApp } from 'librechat-data-provider';
import { useListArtifactAppsQuery } from '~/data-provider';
import ArtifactAppsList from './ArtifactAppsList';

jest.mock('~/data-provider', () => ({
  useListArtifactAppsQuery: jest.fn(),
}));

jest.mock('recoil', () => ({
  ...jest.requireActual('recoil'),
  useSetRecoilState: jest.fn(),
}));

jest.mock('~/hooks', () => ({
  useAuthContext: () => ({ user: { id: 'user-1', role: 'USER' } }),
  useDebounce: (value: string) => value,
  useLocalize: () => (key: string) => {
    const translations: Record<string, string> = {
      com_ui_artifact_apps: 'Artifacts',
      com_ui_artifact_apps_description: 'Artifacts published from your conversations.',
      com_ui_artifact_apps_search_placeholder: 'Search artifacts',
      com_ui_artifact_apps_search_aria: 'Search artifacts',
      com_ui_artifact_apps_clear_search: 'Clear artifact search',
      com_ui_artifact_apps_no_results: 'No artifacts found',
      com_ui_artifact_apps_no_results_hint: 'Try a different name, description, category, or tag.',
      com_ui_artifact_catalog_filters: 'Artifact catalog filters',
      com_ui_artifact_scope_personal: 'Personal',
      com_ui_artifact_scope_shared: 'Shared',
      com_ui_artifact_scope_all: 'All',
      com_ui_artifact_shared_with_you: 'Shared with you',
    };
    return translations[key] ?? key;
  },
}));

jest.mock('@librechat/client', () => ({
  ...jest.requireActual('@librechat/client'),
  useMediaQuery: () => false,
}));

jest.mock('~/components/Chat/Menus/OpenSidebar', () => () => null);
jest.mock('./ArtifactAppsAdminSettings', () => () => <button data-testid="mock-admin-settings" />);

const mockUseListArtifactAppsQuery = jest.mocked(useListArtifactAppsQuery);
const mockSetArtifactNavigationRequest = jest.fn();

function makeListQueryResult(): ReturnType<typeof useListArtifactAppsQuery> {
  return {
    data: { pages: [{ apps, has_more: false, after: null }], pageParams: [undefined] },
    dataUpdatedAt: 0,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    failureCount: 0,
    failureReason: null,
    fetchNextPage: jest.fn(),
    fetchPreviousPage: jest.fn(),
    fetchStatus: 'idle',
    hasNextPage: false,
    hasPreviousPage: false,
    isError: false,
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isFetchingNextPage: false,
    isFetchingPreviousPage: false,
    isInitialLoading: false,
    isLoading: false,
    isLoadingError: false,
    isPaused: false,
    isPlaceholderData: false,
    isPreviousData: false,
    isRefetchError: false,
    isRefetching: false,
    isStale: false,
    isSuccess: true,
    refetch: jest.fn(),
    remove: jest.fn(),
    status: 'success',
  };
}

const apps = [
  {
    id: 'db-quarterly-report',
    artifactAppId: 'quarterly-report',
    createdBy: 'user-1',
    title: 'Quarterly Report',
    description: 'Revenue summary',
    category: 'Finance',
    tags: ['forecast'],
    latestVersionNumber: 2,
    status: 'published',
    visibility: 'private',
    sourceMetadata: {
      conversationId: 'conversation-1',
      messageId: 'message-2',
      originalArtifactId: 'artifact-revision-2',
      sourceKey: 'identifier:quarterly-report',
    },
  },
  {
    id: 'db-team-planner',
    artifactAppId: 'team-planner',
    createdBy: 'user-2',
    title: 'Team Planner',
    description: 'Coordinate delivery work',
    category: 'Planning',
    tags: ['schedule'],
    latestVersionNumber: 1,
    status: 'draft',
    visibility: 'tenant',
  },
] as TArtifactApp[];

describe('ArtifactAppsList', () => {
  beforeEach(() => {
    jest.mocked(useSetRecoilState).mockReturnValue(mockSetArtifactNavigationRequest);
    window.history.replaceState({}, '', '/apps');
    mockUseListArtifactAppsQuery.mockReturnValue(makeListQueryResult());
  });

  it('renders a Marketplace-style heading, search field, and admin settings action', () => {
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Artifacts' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search artifacts' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Personal' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByTestId('mock-admin-settings')).not.toHaveLength(0);
  });

  it('sends metadata search to the paginated server query', () => {
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    const search = screen.getByRole('textbox', { name: 'Search artifacts' });
    fireEvent.change(search, { target: { value: 'forecast' } });

    expect(mockUseListArtifactAppsQuery).toHaveBeenLastCalledWith('personal', 'forecast');
  });

  it('requests the selected catalog scope', () => {
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Shared' }));
    expect(mockUseListArtifactAppsQuery).toHaveBeenLastCalledWith('shared', '');
  });

  it('loads the next cursor page on request', () => {
    const fetchNextPage = jest.fn();
    mockUseListArtifactAppsQuery.mockReturnValue({
      ...makeListQueryResult(),
      fetchNextPage,
      hasNextPage: true,
    });
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'com_ui_load_more' }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('keeps cursor pagination available while filtering loaded artifacts', () => {
    const fetchNextPage = jest.fn();
    mockUseListArtifactAppsQuery.mockReturnValue({
      ...makeListQueryResult(),
      fetchNextPage,
      hasNextPage: true,
    });
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: 'Search artifacts' }), {
      target: { value: 'artifact on a later page' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'com_ui_load_more' }));

    expect(screen.queryByText('No artifacts found')).not.toBeInTheDocument();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('opens an owned artifact at its latest stored revision', () => {
    render(
      <BrowserRouter>
        <ArtifactAppsList />
      </BrowserRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Quarterly Report/i }));

    expect(window.location.pathname).toBe('/c/conversation-1');
    expect(new URLSearchParams(window.location.search).get('artifact')).toBe(
      'identifier:quarterly-report',
    );
    expect(new URLSearchParams(window.location.search).get('artifactId')).toBe(
      'artifact-revision-2',
    );
    expect(mockSetArtifactNavigationRequest).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      sourceKey: 'identifier:quarterly-report',
      originalArtifactId: 'artifact-revision-2',
      messageId: 'message-2',
    });
  });
});
