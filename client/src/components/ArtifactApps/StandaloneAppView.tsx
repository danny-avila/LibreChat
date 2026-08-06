import { useParams, useNavigate } from 'react-router-dom';
import type { TArtifactVersion } from 'librechat-data-provider';
import {
  useGetArtifactAppQuery,
  useGetArtifactAppVersionQuery,
  useListArtifactAppVersionsQuery,
} from '~/data-provider';
import useLocalize from '~/hooks/useLocalize';
import AppRenderer from './AppRenderer';

function errorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } } | null)?.response?.status;
}

function StateMessage({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex h-full w-full items-center justify-center p-8 text-center text-text-secondary"
    >
      <p className="max-w-md text-lg">{message}</p>
    </div>
  );
}

export default function StandaloneAppView() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { artifactAppId, versionId } = useParams<{
    artifactAppId: string;
    versionId?: string;
  }>();

  const appQuery = useGetArtifactAppQuery(artifactAppId);
  const versionQuery = useGetArtifactAppVersionQuery(artifactAppId, versionId, {
    enabled: !!versionId,
  });
  const versionsQuery = useListArtifactAppVersionsQuery(artifactAppId);

  if (appQuery.isLoading) {
    return <StateMessage message={localize('com_ui_artifact_app_loading')} />;
  }

  if (appQuery.isError) {
    const status = errorStatus(appQuery.error);
    if (status === 403) {
      return <StateMessage message={localize('com_ui_artifact_app_forbidden')} />;
    }
    return <StateMessage message={localize('com_ui_artifact_app_not_found')} />;
  }

  const app = appQuery.data?.app;
  if (!app) {
    return <StateMessage message={localize('com_ui_artifact_app_not_found')} />;
  }

  if (app.status === 'suspended') {
    return <StateMessage message={localize('com_ui_artifact_app_suspended')} />;
  }
  if (app.status === 'archived') {
    return <StateMessage message={localize('com_ui_artifact_app_archived')} />;
  }

  const version: TArtifactVersion | null | undefined = versionId
    ? versionQuery.data
    : appQuery.data?.version;

  const versions = versionsQuery.data?.versions ?? [];

  return (
    <div className="flex h-screen w-full flex-col bg-surface-primary">
      <header className="flex items-center justify-between gap-4 border-b border-border-light px-6 py-3">
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold text-text-primary">{app.title}</h1>
          {app.description != null && app.description.length > 0 && (
            <p className="truncate text-sm text-text-secondary">{app.description}</p>
          )}
        </div>
        {versions.length > 0 && (
          <nav aria-label={localize('com_ui_artifact_app_version')} className="flex-shrink-0">
            <select
              aria-label={localize('com_ui_artifact_app_version')}
              className="rounded border border-border-medium bg-surface-secondary px-2 py-1 text-sm text-text-primary"
              value={version?.artifactVersionId ?? ''}
              onChange={(e) =>
                navigate(`/apps/${app.artifactAppId}/version/${e.target.value}`)
              }
            >
              {versions.map((v) => (
                <option key={v.artifactVersionId} value={v.artifactVersionId}>
                  {`v${v.versionNumber}`}
                </option>
              ))}
            </select>
          </nav>
        )}
      </header>
      <main className="min-h-0 flex-1">
        {version ? (
          <AppRenderer title={app.title} version={version} />
        ) : (
          <StateMessage message={localize('com_ui_artifact_app_no_version')} />
        )}
      </main>
    </div>
  );
}
