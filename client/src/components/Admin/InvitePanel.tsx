import React, { useState } from 'react';
import { SystemRoles } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useAdminUsers, useInviteUser, useDeleteAdminUser, useUpdateUserRole } from '~/data-provider';
import type { TAdminUser } from 'librechat-data-provider';

const ROLE_STYLES: Record<string, { background: string; color: string }> = {
  [SystemRoles.ADMIN]: { background: 'rgba(201,168,124,0.18)', color: '#c9a87c' },
  [SystemRoles.TEAM]: { background: 'rgba(100,160,255,0.15)', color: '#64a0ff' },
  [SystemRoles.USER]: { background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.45)' },
};

const ALL_ROLES = [SystemRoles.ADMIN, SystemRoles.TEAM, SystemRoles.USER];

type UserRowProps = {
  user: TAdminUser;
  confirmDeleteId: string | null;
  confirmRoleId: string | null;
  onDeleteClick: (id: string) => void;
  onDeleteConfirm: (id: string) => void;
  onRoleClick: (id: string) => void;
  onRoleConfirm: (id: string, newRole: string) => void;
  onCancel: () => void;
  isDeleting: boolean;
  isUpdatingRole: boolean;
};

const RoleBadge = ({ role }: { role: string }) => {
  const style = ROLE_STYLES[role] ?? ROLE_STYLES[SystemRoles.USER];
  return (
    <span className="rounded px-2 py-0.5 text-xs font-semibold" style={style}>
      {role}
    </span>
  );
};

const UserRow = ({
  user,
  confirmDeleteId,
  confirmRoleId,
  onDeleteClick,
  onDeleteConfirm,
  onRoleClick,
  onRoleConfirm,
  onCancel,
  isDeleting,
  isUpdatingRole,
}: UserRowProps) => {
  const localize = useLocalize();
  const isPendingDelete = confirmDeleteId === user._id;
  const isPendingRole = confirmRoleId === user._id;
  const availableRoles = ALL_ROLES.filter((r) => r !== user.role);
  const [selectedNewRole, setSelectedNewRole] = useState(availableRoles[0]);

  return (
    <div
      className="flex items-center justify-between rounded-lg px-4 py-3"
      style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium" style={{ color: 'rgba(255,255,255,0.9)' }}>
          {user.name || '—'}
        </p>
        <p className="truncate text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
          {user.email}
        </p>
      </div>
      <div className="ml-4 flex shrink-0 items-center gap-2">
        {isPendingRole ? (
          <div className="flex items-center gap-1.5">
            <select
              value={selectedNewRole}
              onChange={(e) => setSelectedNewRole(e.target.value)}
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)', border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
            >
              {availableRoles.map((r) => (
                <option key={r} value={r} style={{ background: '#1a1a2e' }}>{r}</option>
              ))}
            </select>
            <button
              onClick={() => onRoleConfirm(user._id, selectedNewRole)}
              disabled={isUpdatingRole}
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{ background: 'rgba(201,168,124,0.25)', color: '#c9a87c', cursor: isUpdatingRole ? 'not-allowed' : 'pointer', opacity: isUpdatingRole ? 0.6 : 1 }}
            >
              {localize('com_ui_confirm')}
            </button>
            <button
              onClick={onCancel}
              className="rounded px-2 py-1 text-xs font-semibold"
              style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
            >
              {localize('com_ui_cancel')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => onRoleClick(user._id)}
            title={localize('com_ui_admin_change_role')}
            aria-label={localize('com_ui_admin_change_role')}
          >
            <RoleBadge role={user.role} />
          </button>
        )}
        {!isPendingRole && (
          isPendingDelete ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => onDeleteConfirm(user._id)}
                disabled={isDeleting}
                className="rounded px-2 py-1 text-xs font-semibold"
                style={{ background: '#A81A49', color: '#fff', cursor: isDeleting ? 'not-allowed' : 'pointer', opacity: isDeleting ? 0.6 : 1 }}
              >
                {localize('com_ui_admin_delete_confirm')}
              </button>
              <button
                onClick={onCancel}
                className="rounded px-2 py-1 text-xs font-semibold"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
              >
                {localize('com_ui_admin_delete_cancel')}
              </button>
            </div>
          ) : (
            user.role !== 'ADMIN' && (
              <button
                onClick={() => onDeleteClick(user._id)}
                className="rounded p-1.5 transition-colors"
                style={{ color: 'rgba(255,255,255,0.3)', background: 'transparent' }}
                aria-label={localize('com_ui_admin_delete_user')}
                title={localize('com_ui_admin_delete_user')}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            )
          )
        )}
      </div>
    </div>
  );
};

export default function InvitePanel() {
  const localize = useLocalize();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmRoleId, setConfirmRoleId] = useState<string | null>(null);

  const { data: users, isLoading: loadingUsers } = useAdminUsers();
  const inviteMutation = useInviteUser();
  const deleteMutation = useDeleteAdminUser();
  const roleMutation = useUpdateUserRole();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg('');
    setErrorMsg('');
    inviteMutation.mutate(
      { name, email },
      {
        onSuccess: () => {
          setSuccessMsg(localize('com_ui_admin_invite_success'));
          setName('');
          setEmail('');
        },
        onError: (err: unknown) => {
          const msg =
            err &&
            typeof err === 'object' &&
            'response' in err &&
            (err as { response?: { data?: { message?: string } } }).response?.data?.message;
          setErrorMsg(msg || localize('com_ui_admin_invite_error'));
        },
      },
    );
  };

  const handleConfirmDelete = (id: string) => {
    deleteMutation.mutate(id, {
      onSuccess: () => {
        setConfirmDeleteId(null);
        setSuccessMsg(localize('com_ui_admin_delete_success'));
      },
      onError: (err: unknown) => {
        setConfirmDeleteId(null);
        const msg =
          err &&
          typeof err === 'object' &&
          'response' in err &&
          (err as { response?: { data?: { message?: string } } }).response?.data?.message;
        setErrorMsg(msg || localize('com_ui_admin_delete_error'));
      },
    });
  };

  const handleConfirmRole = (id: string, newRole: string) => {
    roleMutation.mutate(
      { id, role: newRole },
      {
        onSuccess: () => {
          setConfirmRoleId(null);
          setSuccessMsg(localize('com_ui_admin_role_changed'));
        },
        onError: (err: unknown) => {
          setConfirmRoleId(null);
          const msg =
            err &&
            typeof err === 'object' &&
            'response' in err &&
            (err as { response?: { data?: { message?: string } } }).response?.data?.message;
          setErrorMsg(msg || localize('com_ui_admin_role_change_error'));
        },
      },
    );
  };

  const handleCancel = () => {
    setConfirmDeleteId(null);
    setConfirmRoleId(null);
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: '0.5rem',
    color: 'rgba(255,255,255,0.9)',
    padding: '0.6rem 0.875rem',
    width: '100%',
    fontSize: '0.875rem',
    outline: 'none',
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold" style={{ color: '#c9a87c' }}>
        {localize('com_ui_admin_users_title')}
      </h1>

      <div
        className="mb-8 rounded-xl p-6"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(201,168,124,0.2)' }}
      >
        <h2 className="mb-4 text-base font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {localize('com_ui_admin_invite_title')}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label
              htmlFor="invite-name"
              className="mb-1 block text-xs font-medium"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {localize('com_ui_name')}
            </label>
            <input
              id="invite-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Max Mustermann"
              style={inputStyle}
              autoComplete="off"
            />
          </div>
          <div>
            <label
              htmlFor="invite-email"
              className="mb-1 block text-xs font-medium"
              style={{ color: 'rgba(255,255,255,0.5)' }}
            >
              {localize('com_auth_email')}
            </label>
            <input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="max@karrieremum.at"
              required
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          {successMsg && (
            <p className="text-sm" style={{ color: '#6ee7b7' }}>
              {successMsg}
            </p>
          )}
          {errorMsg && (
            <p className="text-sm" style={{ color: '#f87171' }}>
              {errorMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={inviteMutation.isLoading || !email}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition-colors"
            style={{
              background: inviteMutation.isLoading || !email ? 'rgba(168,26,73,0.4)' : '#A81A49',
              cursor: inviteMutation.isLoading || !email ? 'not-allowed' : 'pointer',
            }}
          >
            {inviteMutation.isLoading
              ? localize('com_ui_admin_invite_sending')
              : localize('com_ui_admin_invite_send')}
          </button>
        </form>
      </div>

      <div>
        <h2 className="mb-1 text-base font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {localize('com_ui_admin_users_list')}
        </h2>
        <p className="mb-3 text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {localize('com_ui_admin_role_hint')}
        </p>
        {loadingUsers && (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {localize('com_ui_loading')}
          </p>
        )}
        {!loadingUsers && (!users || users.length === 0) && (
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>
            {localize('com_ui_admin_no_users')}
          </p>
        )}
        <div className="overflow-hidden rounded-xl" style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
          {users?.map((u) => (
            <UserRow
              key={u._id}
              user={u}
              confirmDeleteId={confirmDeleteId}
              confirmRoleId={confirmRoleId}
              onDeleteClick={setConfirmDeleteId}
              onDeleteConfirm={handleConfirmDelete}
              onRoleClick={setConfirmRoleId}
              onRoleConfirm={handleConfirmRole}
              onCancel={handleCancel}
              isDeleting={deleteMutation.isLoading}
              isUpdatingRole={roleMutation.isLoading}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
