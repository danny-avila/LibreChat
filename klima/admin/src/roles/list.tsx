import type { AdminRolesResponse, AdminRole } from './types';
import type { RemoteState } from '../api';

import { buttonSecondary, ErrorNote, Loading, Empty, Pagination } from '../ui';
import { isSystemRole } from './system';

interface RolesTableProps {
  state: RemoteState<AdminRolesResponse>;
  selectedName?: string;
  onSelect: (role: AdminRole) => void;
  onOffsetChange: (offset: number) => void;
}

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';
const bodyCell = 'px-3 py-2 align-top text-sm text-slate-700';

export const RolesTable = ({ state, selectedName, onSelect, onOffsetChange }: RolesTableProps) => {
  if (state.status === 'loading') {
    return <Loading label="Loading roles…" />;
  }

  if (state.status === 'failed') {
    return <ErrorNote error={state.error} label="Could not load roles." />;
  }

  const { roles, total, limit, offset } = state.data;

  if (roles.length === 0) {
    return (
      <div>
        <Empty>
          No role on this page. ADMIN and USER are created on first boot; create a role below to add
          one of your own.
        </Empty>
        <Pagination
          total={total}
          limit={limit}
          offset={offset}
          label="Roles pages"
          onOffsetChange={onOffsetChange}
        />
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <caption className="px-3 py-2 text-left text-sm text-slate-600">
            Every role, by name. The list endpoint returns only the name and the description, so
            member counts and permissions load with the role you open.
          </caption>
          <thead className="bg-slate-50">
            <tr>
              <th scope="col" className={headerCell}>
                Name
              </th>
              <th scope="col" className={headerCell}>
                Kind
              </th>
              <th scope="col" className={headerCell}>
                Description
              </th>
              <th scope="col" className={headerCell}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => {
              const isSelected = role.name === selectedName;
              const isSystem = isSystemRole(role.name);
              return (
                <tr
                  key={role._id || role.name}
                  className={isSelected ? 'bg-blue-50' : 'odd:bg-white even:bg-slate-50'}
                >
                  <th scope="row" className={`${bodyCell} font-medium text-slate-900`}>
                    {role.name}
                  </th>
                  <td className={bodyCell}>
                    {isSystem ? (
                      <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700">
                        System role
                      </span>
                    ) : (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-900">
                        Custom role
                      </span>
                    )}
                  </td>
                  <td className={bodyCell}>{role.description || '—'}</td>
                  <td className={bodyCell}>
                    <button
                      type="button"
                      className={buttonSecondary}
                      aria-label={`Open ${role.name}`}
                      aria-pressed={isSelected}
                      onClick={() => onSelect(role)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <Pagination
        total={total}
        limit={limit}
        offset={offset}
        label="Roles pages"
        onOffsetChange={onOffsetChange}
      />
    </div>
  );
};
