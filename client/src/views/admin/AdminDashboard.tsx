import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QueryKeys, request } from 'librechat-data-provider';
import DataTable from '~/components/ui/DataTable';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/Dialog';

type AdminUser = {
  _id: string;
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  createdAt?: string;
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);

  const usersQuery = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'users', { page, limit, search, role }],
    queryFn: async () => {
      const q = new URLSearchParams();
      q.set('page', String(page));
      q.set('limit', String(limit));
      if (search) q.set('search', search);
      if (role) q.set('role', role);
      return await request.get(`/api/admin/users?${q.toString()}`);
    },
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, nextRole }: { id: string; nextRole: string }) =>
      await request.put(`/api/admin/users/${id}/role`, { role: nextRole }),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.roles, 'admin', 'users']);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => await request.delete(`/api/admin/users/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries([QueryKeys.roles, 'admin', 'users']);
    },
  });

  const columns = useMemo(
    () => [
      { accessorKey: 'email', header: 'Email', meta: { minWidth: 160 } },
      { accessorKey: 'username', header: 'Username', meta: { minWidth: 120 } },
      { accessorKey: 'name', header: 'Name', meta: { minWidth: 120 } },
      { accessorKey: 'role', header: 'Role', meta: { minWidth: 100 } },
      {
        id: 'actions',
        header: 'Actions',
        meta: { minWidth: 280 },
        cell: ({ row }: any) => {
          const user: AdminUser = row.original;
          const toggleRole = user.role === 'ADMIN' ? 'USER' : 'ADMIN';
          return (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => updateRoleMutation.mutate({ id: user._id, nextRole: toggleRole })}
              >
                Set {toggleRole}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setSelectedUser(user);
                  setUsageOpen(true);
                }}
              >
                View
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => deleteUserMutation.mutate(user._id)}
              >
                Delete
              </Button>
            </div>
          );
        },
      },
    ],
    [updateRoleMutation, deleteUserMutation],
  );

  const data = ((usersQuery.data as any)?.users ?? []) as AdminUser[];
  const total = (usersQuery.data as any)?.total ?? 0;

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Admin Dashboard</h2>
        <Button variant="outline" onClick={() => navigate('/c/new')}>Back to Chat</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          placeholder="Search email, username, name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input
          placeholder="Role (ADMIN/USER)"
          value={role}
          onChange={(e) => setRole(e.target.value.toUpperCase())}
        />
        <Button onClick={() => usersQuery.refetch()}>Search</Button>
      </div>

      <DataTable columns={columns as any} data={data} />

      <div className="flex items-center justify-between">
        <div>
          Page {page} / {Math.max(1, Math.ceil(total / limit))} ({total} users)
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <UserUsageDialog
        open={usageOpen}
        onOpenChange={setUsageOpen}
        user={selectedUser}
        invalidate={(from?: string, to?: string) =>
          selectedUser &&
          queryClient.invalidateQueries({
            queryKey: [QueryKeys.roles, 'admin', 'usage', selectedUser._id, from, to],
          })
        }
      />
    </div>
  );
}

function toISO(dateStr?: string, endOfDay?: boolean) {
  if (!dateStr) return undefined;
  return endOfDay ? `${dateStr}T23:59:59.999Z` : `${dateStr}T00:00:00.000Z`;
}

function barWidth(value: number, max: number) {
  if (!max) return '0%';
  const pct = Math.min(100, Math.round((value / max) * 100));
  return `${pct}%`;
}

function UserUsage({ userId, from, to }: { userId: string; from?: string; to?: string }) {
  const { data, isFetching } = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'usage', userId, from, to],
    queryFn: async () => {
      const q = new URLSearchParams();
      const f = toISO(from);
      const t = toISO(to, true);
      if (f) q.set('from', f);
      if (t) q.set('to', t);
      return await request.get(
        `/api/admin/users/${userId}/usage${q.toString() ? `?${q.toString()}` : ''}`,
      );
    },
    refetchOnWindowFocus: false,
  });

  const byModel = ((data as any)?.byModel ?? []) as Array<{
    model: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    tokenValue: number;
  }>;
  const totals = ((data as any)?.totals ?? {
    promptTokens: 0,
    completionTokens: 0,
    tokenValue: 0,
  }) as any;
  const maxTokens = byModel.reduce((m, r) => Math.max(m, r.totalTokens || 0), 0);

  return (
    <div>
      <div className="mb-2 text-base font-semibold">Usage by Model</div>
      <div className="flex flex-col gap-2">
        {isFetching && <div className="text-text-secondary">Loading usage…</div>}
        {!isFetching && byModel.length === 0 && (
          <div className="text-text-secondary">No usage for selected range.</div>
        )}
        {byModel.map((row) => (
          <div key={row.model} className="rounded-md border border-border-light p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <div className="font-medium">{row.model}</div>
              <div className="text-text-secondary">{row.totalTokens} tokens</div>
            </div>
            <div className="mb-2 h-2 w-full rounded bg-surface-secondary">
              <div
                className="h-2 rounded bg-primary"
                style={{ width: barWidth(row.totalTokens, maxTokens) }}
              />
            </div>
            <div className="grid grid-cols-4 gap-2 text-xs text-text-secondary">
              <div>Prompt: {row.promptTokens}</div>
              <div>Completion: {row.completionTokens}</div>
              <div>Total: {row.totalTokens}</div>
              <div>Value: {Math.round(row.tokenValue)}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 text-sm text-text-secondary">
        Totals — Prompt: {totals.promptTokens} · Completion: {totals.completionTokens} · Value:{' '}
        {Math.round(totals.tokenValue)}
      </div>
    </div>
  );
}

function UserMessages({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const limit = 50;
  const { data, isFetching, refetch } = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'messages', userId, page],
    queryFn: async () => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      return await request.get(`/api/admin/users/${userId}/messages?${q.toString()}`);
    },
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  const rows = ((data as any)?.messages ?? []) as Array<{
    createdAt?: string;
    sender?: string;
    isCreatedByUser?: boolean;
    model?: string;
    tokenCount?: number;
    text?: string;
  }>;
  const total = (data as any)?.total ?? 0;

  return (
    <div className="mt-6">
      <div className="mb-2 text-base font-semibold">Recent Messages</div>
      {isFetching && <div className="text-text-secondary">Loading messages…</div>}
      {!isFetching && rows.length === 0 && (
        <div className="text-text-secondary">No messages found.</div>
      )}
      <div className="flex flex-col gap-2">
        {rows.map((m, idx) => (
          <div key={idx} className="rounded-md border border-border-light p-3">
            <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
              <div>{new Date(m.createdAt || '').toLocaleString()}</div>
              <div>{m.isCreatedByUser ? 'User' : 'Assistant'}</div>
            </div>
            <div className="mb-1 text-sm">
              <span className="font-medium">Model:</span> {m.model || '-'}
              {m.tokenCount != null && <span className="ml-3">Tokens: {m.tokenCount}</span>}
            </div>
            <div className="text-sm text-text-secondary line-clamp-3">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between">
        <div className="text-xs text-text-secondary">
          Page {page} / {Math.max(1, Math.ceil(total / limit))} ({total} messages)
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Prev
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={page >= Math.ceil(total / limit)}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
          <Button size="sm" variant="ghost" onClick={() => refetch()}>
            Refresh
          </Button>
        </div>
      </div>
    </div>
  );
}

function UserUsageDialog({
  open,
  onOpenChange,
  user,
  invalidate,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  user: AdminUser | null;
  invalidate: (from?: string, to?: string) => void;
}) {
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Usage: {user?.email || user?.username}</DialogTitle>
        </DialogHeader>
        {user ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              <Button variant="outline" onClick={() => invalidate(from, to)}>
                Apply
              </Button>
            </div>
            <UserUsage userId={user._id} from={from} to={to} />
          </div>
        ) : (
          <div className="text-text-secondary">No user selected</div>
        )}
      </DialogContent>
    </Dialog>
  );
}


