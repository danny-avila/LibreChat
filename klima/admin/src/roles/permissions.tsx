import { useMemo, useState } from 'react';

import type {
  AdminRoleResponse,
  AdminRoleDetail,
  RolePermissions,
  UpdatePermissionsBody,
} from './types';
import type { PermissionGroup, PermissionBit } from './matrix';
import type { ApiClient, ApiError } from '../api';

import {
  BUILDER_ESSENTIALS,
  PERMISSION_GROUPS,
  countGranted,
  isSameDraft,
  TOTAL_BITS,
  withCells,
  withBit,
  readBit,
  toDraft,
} from './matrix';
import { buttonPrimary, buttonSecondary, ErrorNote, SuccessNote, WarningNote } from '../ui';
import { rolePermissionsPath } from './paths';
import { RESEED_WARNING, isSystemRole } from './system';

interface PermissionsEditorProps {
  client: ApiClient;
  role: AdminRoleDetail;
  onSaved: (role: AdminRoleDetail) => void;
}

/** What each refusal from `PATCH /api/admin/roles/:name/permissions` means. */
const REFUSALS: Record<number, string> = {
  400: 'The API expects a `permissions` object. Reload the role and try again.',
  403: 'Your role does not carry the `manage:roles` capability that writing permissions needs.',
  404: 'That role no longer exists. Reload the list.',
};

const headerCell = 'px-3 py-2 text-left text-xs font-semibold uppercase text-slate-500';

const GroupTable = ({
  group,
  draft,
  disabled,
  onToggle,
}: {
  group: PermissionGroup;
  draft: RolePermissions;
  disabled: boolean;
  onToggle: (next: RolePermissions) => void;
}) => (
  <section className="rounded border border-slate-200">
    <h4 className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900">
      {group.name}
      <span className="block text-xs font-normal text-slate-600">{group.description}</span>
    </h4>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <caption className="sr-only">
          {group.name}: one row per feature, one column per permission bit the schema defines for
          it.
        </caption>
        <thead>
          <tr>
            <th scope="col" className={headerCell}>
              Feature
            </th>
            {group.columns.map((column: PermissionBit) => (
              <th key={column.bit} scope="col" className={`${headerCell} text-center`}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group.rows.map((row) => {
            const available = new Set(row.bits.map((entry) => entry.bit));
            return (
              <tr key={row.type} className="odd:bg-white even:bg-slate-50">
                <th scope="row" className="px-3 py-2 text-left align-top">
                  <span className="text-sm font-medium text-slate-900">{row.label}</span>
                  {row.description ? (
                    <span className="block text-xs font-normal text-slate-600">
                      {row.description}
                    </span>
                  ) : null}
                </th>
                {group.columns.map((column) => {
                  if (!available.has(column.bit)) {
                    return (
                      <td key={column.bit} className="px-3 py-2 text-center text-slate-400">
                        <span aria-hidden="true">—</span>
                        <span className="sr-only">
                          {column.label} does not apply to {row.label}
                        </span>
                      </td>
                    );
                  }
                  const checked = readBit(draft, row.type, column.bit);
                  return (
                    <td key={column.bit} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-blue-700"
                        checked={checked}
                        disabled={disabled}
                        aria-label={`${row.label}: ${column.label}`}
                        onChange={(event) =>
                          onToggle(withBit(draft, row.type, column.bit, event.target.checked))
                        }
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </section>
);

export const PermissionsEditor = ({ client, role, onSaved }: PermissionsEditorProps) => {
  const baseline = useMemo(() => toDraft(role.permissions), [role.permissions]);
  const [draft, setDraft] = useState<RolePermissions>(baseline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [message, setMessage] = useState('');

  const dirty = !isSameDraft(draft, baseline);
  const builderGranted = BUILDER_ESSENTIALS.every((cell) => readBit(draft, cell.type, cell.bit));

  const change = (next: RolePermissions): void => {
    setMessage('');
    setDraft(next);
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);
    setMessage('');

    const result = await client.patch<AdminRoleResponse, UpdatePermissionsBody>(
      rolePermissionsPath(role.name),
      { permissions: draft },
    );
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setMessage(`Saved ${countGranted(draft)} of ${TOTAL_BITS} permissions for ${role.name}.`);
    onSaved(result.data.role);
  };

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-base font-semibold text-slate-900">Permissions</h3>
      <p className="mb-3 text-sm text-slate-600">
        {countGranted(draft)} of {TOTAL_BITS} granted. Only the boxes the role schema defines for a
        feature are shown; everything else is a dash. Saving writes an explicit value for every box
        here, including the ones you did not touch.
      </p>

      {isSystemRole(role.name) ? (
        <div className="mb-3">
          <WarningNote>{RESEED_WARNING}</WarningNote>
        </div>
      ) : null}

      {BUILDER_ESSENTIALS.length > 0 ? (
        <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3">
          <h4 className="text-sm font-semibold text-blue-900">What a BUILDER role needs</h4>
          <ul className="mt-2 space-y-1">
            {BUILDER_ESSENTIALS.map((cell) => (
              <li key={`${cell.type}-${cell.bit}`} className="text-sm text-blue-900">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-blue-700"
                    checked={readBit(draft, cell.type, cell.bit)}
                    disabled={submitting}
                    onChange={(event) =>
                      change(withBit(draft, cell.type, cell.bit, event.target.checked))
                    }
                  />
                  {cell.label}
                </label>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${buttonSecondary} mt-3`}
            disabled={submitting || builderGranted}
            onClick={() => change(withCells(draft, BUILDER_ESSENTIALS, true))}
          >
            {builderGranted ? 'All builder permissions are on' : 'Tick all builder permissions'}
          </button>
          <p className="mt-2 text-xs text-blue-900">
            Ticking them here only changes the form. Nothing reaches the server until you save.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {PERMISSION_GROUPS.map((group) => (
          <GroupTable
            key={group.name}
            group={group}
            draft={draft}
            disabled={submitting}
            onToggle={change}
          />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={buttonPrimary}
          disabled={!dirty || submitting}
          onClick={() => void submit()}
        >
          {submitting ? 'Saving…' : 'Save permissions'}
        </button>
        <button
          type="button"
          className={buttonSecondary}
          disabled={!dirty || submitting}
          onClick={() => change(baseline)}
        >
          Discard changes
        </button>
        {dirty ? (
          <p className="self-center text-sm text-amber-900" role="status">
            Unsaved changes.
          </p>
        ) : null}
      </div>

      {message ? (
        <div className="mt-3">
          <SuccessNote>{message}</SuccessNote>
        </div>
      ) : null}
      {error ? (
        <div className="mt-3 space-y-2">
          <ErrorNote error={error} label="The permissions were not saved." />
          {REFUSALS[error.status] ? (
            <p className="text-sm text-slate-700">{REFUSALS[error.status]}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
};
