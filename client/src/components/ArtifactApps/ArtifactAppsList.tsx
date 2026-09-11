import { useMemo, useState } from 'react';
import { useSetRecoilState } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useMediaQuery } from '@librechat/client';
import { Shapes, Lock, Users } from 'lucide-react';
import type { ArtifactAppListScope } from 'librechat-data-provider';
import ArtifactAppsAdminSettings from './ArtifactAppsAdminSettings';
import { useAuthContext, useDebounce, useLocalize } from '~/hooks';
import OpenSidebar from '~/components/Chat/Menus/OpenSidebar';
import ArtifactAppsSearchBar from './ArtifactAppsSearchBar';
import { useListArtifactAppsQuery } from '~/data-provider';
import store from '~/store';

const SCOPES: ArtifactAppListScope[] = ['personal', 'shared', 'all'];
const SCOPE_LABELS = {
  personal: 'com_ui_artifact_scope_personal',
  shared: 'com_ui_artifact_scope_shared',
  all: 'com_ui_artifact_scope_all',
} as const;

export default function ArtifactAppsList() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { user } = useAuthContext();
  const setArtifactNavigationRequest = useSetRecoilState(store.artifactNavigationRequest);
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const [searchQuery, setSearchQuery] = useState('');
  const [scope, setScope] = useState<ArtifactAppListScope>('personal');
  const debouncedSearchQuery = useDebounce(searchQuery.trim(), 300);
  const { data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage } =
    useListArtifactAppsQuery(scope, debouncedSearchQuery);
  const apps = useMemo(() => data?.pages.flatMap((page) => page.apps) ?? [], [data]);

  const openArtifact = (app: (typeof apps)[number]) => {
    const source = app.sourceMetadata;
    if (app.createdBy === user?.id && source?.conversationId) {
      const artifactKey = source.sourceKey ?? source.originalArtifactId ?? source.messageId;
      const params = new URLSearchParams();
      if (artifactKey) {
        params.set('artifact', artifactKey);
      }
      if (source.sourceKey && source.originalArtifactId) {
        params.set('artifactId', source.originalArtifactId);
      }
      if (source.sourceKey && source.messageId) {
        params.set('artifactMessageId', source.messageId);
      }
      const query = params.size > 0 ? `?${params.toString()}` : '';
      setArtifactNavigationRequest(
        artifactKey
          ? {
              conversationId: source.conversationId,
              sourceKey: artifactKey,
              originalArtifactId: source.originalArtifactId,
              messageId: source.messageId,
            }
          : null,
      );
      navigate(`/c/${source.conversationId}${query}`);
      return;
    }
    navigate(`/apps/${app.artifactAppId}`);
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-text-secondary">
          {localize('com_ui_artifact_app_loading')}
        </div>
      );
    }

    if (isError) {
      return (
        <div className="flex flex-1 items-center justify-center p-8 text-text-secondary">
          {localize('com_ui_artifact_app_not_found')}
        </div>
      );
    }

    if (apps.length === 0 && !hasNextPage) {
      const titleKey = searchQuery
        ? 'com_ui_artifact_apps_no_results'
        : 'com_ui_artifact_apps_empty';
      const hintKey = searchQuery
        ? 'com_ui_artifact_apps_no_results_hint'
        : 'com_ui_artifact_apps_empty_hint';

      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Shapes size={40} className="text-text-secondary opacity-40" aria-hidden="true" />
          <p className="text-text-secondary">{localize(titleKey)}</p>
          <p className="max-w-sm text-sm text-text-secondary">{localize(hintKey)}</p>
        </div>
      );
    }

    return (
      <>
        <ul>
          {apps.map((app) => (
            <li key={app.artifactAppId}>
              <button
                className="focus-visible:ring-ring mb-3 flex w-full items-start gap-4 rounded-xl border border-border-light bg-surface-secondary p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2"
                onClick={() => openArtifact(app)}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-primary text-xl">
                  {app.icon ?? <Shapes size={20} className="text-text-secondary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-text-primary">{app.title}</span>
                    {app.createdBy === user?.id ? (
                      <Lock size={14} className="text-text-secondary" aria-hidden="true" />
                    ) : (
                      <Users size={14} className="text-text-secondary" aria-hidden="true" />
                    )}
                    <span className="rounded-full border border-border-light bg-surface-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {localize(
                        app.createdBy === user?.id
                          ? 'com_ui_artifact_scope_personal'
                          : 'com_ui_artifact_shared_with_you',
                      )}
                    </span>
                  </div>
                  {app.description && (
                    <p className="mt-0.5 truncate text-sm text-text-secondary">{app.description}</p>
                  )}
                  <p className="mt-1 text-xs text-text-secondary">
                    {localize('com_ui_artifact_app_version_number', {
                      0: String(app.latestVersionNumber),
                    })}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {hasNextPage && (
          <div className="flex justify-center pt-2">
            <button
              type="button"
              disabled={isFetchingNextPage}
              onClick={() => fetchNextPage()}
              className="rounded-lg border border-border-light bg-surface-secondary px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isFetchingNextPage
                ? localize('com_ui_artifact_app_loading')
                : localize('com_ui_load_more')}
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <main className="relative flex h-full w-full grow flex-col overflow-hidden bg-presentation">
      <div className="scrollbar-gutter-stable relative flex h-full flex-col overflow-y-auto overflow-x-hidden">
        {!isSmallScreen && (
          <div className="container mx-auto max-w-4xl">
            <div className="mb-8 mt-12 text-center">
              <h1 className="mb-3 text-3xl font-bold tracking-tight text-text-primary md:text-5xl">
                {localize('com_ui_artifact_apps')}
              </h1>
              <p className="mx-auto mb-6 max-w-2xl text-lg text-text-secondary">
                {localize('com_ui_artifact_apps_description')}
              </p>
            </div>
          </div>
        )}

        <div className="sticky top-0 z-10 mt-4 bg-presentation pb-4 md:mt-0">
          <div className="container mx-auto max-w-4xl px-4">
            <div className="mx-auto mb-3 flex max-w-2xl items-center justify-between gap-2 md:hidden">
              <OpenSidebar />
              <ArtifactAppsAdminSettings compact />
            </div>
            <div className="mx-auto flex max-w-2xl items-center gap-2 pb-6">
              <ArtifactAppsSearchBar value={searchQuery} onChange={setSearchQuery} />
              {!isSmallScreen && <ArtifactAppsAdminSettings />}
            </div>
            <div
              className="mx-auto flex max-w-2xl gap-1 rounded-xl bg-surface-secondary p-1"
              role="tablist"
              aria-label={localize('com_ui_artifact_catalog_filters')}
            >
              {SCOPES.map((candidate) => (
                <button
                  key={candidate}
                  type="button"
                  role="tab"
                  aria-selected={scope === candidate}
                  onClick={() => setScope(candidate)}
                  className={`focus-visible:ring-ring flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 ${
                    scope === candidate
                      ? 'bg-surface-primary text-text-primary shadow-sm'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text-primary'
                  }`}
                >
                  {localize(SCOPE_LABELS[candidate])}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="container mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-8">
          {renderContent()}
        </div>
      </div>
    </main>
  );
}
