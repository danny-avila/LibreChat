import type { AdminConfigListResponse, ConfigDocument, PrincipalRef } from './types';
import type { Directory } from './directory';
import type { RemoteState } from '../api';

import { buttonSecondary, ErrorNote, Loading, Empty } from '../ui';
import { BASE_PRINCIPAL_ID } from './sections';
import { formatTimestamp } from '../format';

interface OverridesTableProps {
  state: RemoteState<AdminConfigListResponse>;
  directory: Directory;
  selected: PrincipalRef | null;
  onSelect: (principal: PrincipalRef) => void;
}

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';
const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';

const describeSections = (config: ConfigDocument): string => {
  const sections = Object.keys(config.overrides ?? {});
  const tombstoned = (config.tombstones ?? []).length;
  if (sections.length === 0) {
    return tombstoned > 0 ? `${tombstoned} suppressed path(s)` : 'None';
  }
  const suffix = tombstoned > 0 ? ` · ${tombstoned} suppressed` : '';
  return `${sections.sort().join(', ')}${suffix}`;
};

const toPrincipal = (config: ConfigDocument, directory: Directory): PrincipalRef => ({
  kind: config.principalType,
  id: config.principalId,
  label: directory.labelFor(config.principalType, config.principalId) ?? config.principalId,
});

export const OverridesTable = ({ state, directory, selected, onSelect }: OverridesTableProps) => {
  if (state.status === 'loading') {
    return <Loading label="Loading config overrides…" />;
  }

  if (state.status === 'failed') {
    return <ErrorNote error={state.error} label="Could not load config overrides." />;
  }

  if (state.data.configs.length === 0) {
    return (
      <Empty>
        No principal has a config override yet. Pick one below and give it a budget — everyone keeps
        the librechat.yaml defaults until then.
      </Empty>
    );
  }

  const rows = [...state.data.configs].sort((a, b) => b.priority - a.priority);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="px-3 py-2 text-left text-sm text-slate-600">
          Every stored override, highest priority first. When two overrides cover the same person,
          the higher priority wins the fields they both set.
        </caption>
        <thead className="bg-slate-50">
          <tr>
            <th scope="col" className={headerCell}>
              Principal
            </th>
            <th scope="col" className={headerCell}>
              Kind
            </th>
            <th scope="col" className={headerCell}>
              Priority
            </th>
            <th scope="col" className={headerCell}>
              Status
            </th>
            <th scope="col" className={headerCell}>
              Sections
            </th>
            <th scope="col" className={headerCell}>
              Updated
            </th>
            <th scope="col" className={headerCell}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((config) => {
            const principal = toPrincipal(config, directory);
            const isSelected =
              selected?.kind === config.principalType && selected.id === config.principalId;
            const isBase = config.principalId === BASE_PRINCIPAL_ID;
            return (
              <tr
                key={config._id}
                className={isSelected ? 'bg-blue-50' : 'odd:bg-white even:bg-slate-50'}
              >
                <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                  {isBase ? 'Tenant base config' : principal.label}
                  {principal.label === config.principalId ? null : (
                    <span className="block text-xs font-normal text-slate-500">
                      {config.principalId}
                    </span>
                  )}
                </th>
                <td className={bodyCell}>{config.principalType}</td>
                <td className={bodyCell}>{config.priority}</td>
                <td className={bodyCell}>
                  <span
                    className={
                      config.isActive
                        ? 'rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900'
                        : 'rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700'
                    }
                  >
                    {config.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
                <td className={bodyCell}>{describeSections(config)}</td>
                <td className={bodyCell}>{formatTimestamp(config.updatedAt)}</td>
                <td className={bodyCell}>
                  <button
                    type="button"
                    className={buttonSecondary}
                    aria-label={`Edit the override for ${principal.label}`}
                    aria-pressed={isSelected}
                    onClick={() => onSelect(principal)}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
