import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QueryKeys, request } from 'librechat-data-provider';
import { Input } from '~/components/ui/Input';
import { Button } from '~/components/ui/Button';
import { useNavigate } from 'react-router-dom';
import DataTable from '~/components/ui/DataTable';
// We'll call backend admin APIs directly to avoid package sync issues

type AdminUser = {
  _id: string;
  email?: string;
  username?: string;
  name?: string;
  role?: string;
  createdAt?: string;
};

export default function AdminPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

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
      { accessorKey: 'email', header: 'Email' },
      { accessorKey: 'username', header: 'Username' },
      { accessorKey: 'name', header: 'Name' },
      { accessorKey: 'role', header: 'Role' },
      {
        id: 'actions',
        header: 'Actions',
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
    <div className="flex flex-col gap-3 p-2 text-sm">
      <h3 className="text-base font-semibold">Admin</h3>
      <div>
        <Button variant="outline" onClick={() => navigate('/admin')}>
          Proceed to Admin Dashboard
        </Button>
      </div>
      <div className="flex gap-2 items-center">
        <Input
          placeholder="Search email, username, name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Input placeholder="Role (ADMIN/USER)" value={role} onChange={(e) => setRole(e.target.value.toUpperCase())} />
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
    </div>
  );
}


