import { useNavigate } from 'react-router-dom';
import { Rocket, Lock, Globe, Users } from 'lucide-react';
import { useListArtifactAppsQuery } from '~/data-provider';
import { useLocalize } from '~/hooks';
import type { TArtifactApp } from 'librechat-data-provider';

function visibilityIcon(v: TArtifactApp['visibility']) {
  if (v === 'public') return <Globe size={14} className="text-text-secondary" aria-hidden="true" />;
  if (v === 'tenant') return <Users size={14} className="text-text-secondary" aria-hidden="true" />;
  return <Lock size={14} className="text-text-secondary" aria-hidden="true" />;
}

function statusBadge(s: TArtifactApp['status']) {
  const colors: Record<TArtifactApp['status'], string> = {
    draft: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
    pending_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
    published: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    suspended: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
    archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[s] ?? ''}`}>
      {s.replace('_', ' ')}
    </span>
  );
}

export default function ArtifactAppsList() {
  const localize = useLocalize();
  const navigate = useNavigate();
  const { data, isLoading, isError } = useListArtifactAppsQuery();
  const apps = data?.apps ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-secondary">
        {localize('com_ui_artifact_app_loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-text-secondary">
        {localize('com_ui_artifact_app_not_found')}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-surface-primary">
      <header className="border-b border-border-light px-6 py-4">
        <div className="flex items-center gap-2">
          <Rocket size={20} className="text-text-primary" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-text-primary">
            {localize('com_ui_artifact_apps')}
          </h1>
        </div>
        <p className="mt-1 text-sm text-text-secondary">
          {localize('com_ui_artifact_apps_description')}
        </p>
      </header>

      {apps.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
          <Rocket size={40} className="text-text-secondary opacity-40" aria-hidden="true" />
          <p className="text-text-secondary">{localize('com_ui_artifact_apps_empty')}</p>
          <p className="max-w-sm text-sm text-text-secondary">
            {localize('com_ui_artifact_apps_empty_hint')}
          </p>
        </div>
      ) : (
        <ul className="flex-1 overflow-y-auto p-4">
          {apps.map((app) => (
            <li key={app.artifactAppId}>
              <button
                className="mb-3 flex w-full items-start gap-4 rounded-xl border border-border-light bg-surface-secondary p-4 text-left transition-colors hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => navigate(`/apps/${app.artifactAppId}`)}
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-surface-primary text-xl">
                  {app.icon ?? <Rocket size={20} className="text-text-secondary" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium text-text-primary">{app.title}</span>
                    {visibilityIcon(app.visibility)}
                    {statusBadge(app.status)}
                  </div>
                  {app.description && (
                    <p className="mt-0.5 truncate text-sm text-text-secondary">
                      {app.description}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-text-secondary">
                    v{app.latestVersionNumber}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
