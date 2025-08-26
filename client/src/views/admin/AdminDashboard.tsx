import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QueryKeys, request } from 'librechat-data-provider';
import DataTable from '~/components/ui/DataTable';
import { Button } from '~/components/ui/Button';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import { PaginationControls } from '~/views/admin/PaginationControls';
import { UserActions } from '~/views/admin/UserActions';
import { UserUsageDialog } from '~/views/admin/UserUsageDialog';

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
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [usageOpen, setUsageOpen] = useState(false);

  // --- Fetch Users ---
  const usersQuery = useQuery({
    queryKey: [QueryKeys.roles, 'admin', 'users', { page, limit, search }],
    queryFn: async () => {
      const q = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) q.set('search', search);
      return await request.get(`/api/admin/users?${q.toString()}`);
    },
    keepPreviousData: true,
    refetchOnWindowFocus: false,
  });

  // --- Mutations ---
  const updateRoleMutation = useMutation({
    mutationFn: async ({ id, nextRole }: { id: string; nextRole: string }) =>
      await request.put(`/api/admin/users/${id}/role`, { role: nextRole }),
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.roles, 'admin', 'users']),
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => await request.delete(`/api/admin/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries([QueryKeys.roles, 'admin', 'users']),
  });

  const data = ((usersQuery.data as any)?.users ?? []) as AdminUser[];
  const total = (usersQuery.data as any)?.total ?? 0;

  // --- Columns for DataTable ---
  const columns = useMemo(
    () => [
      {
        id: 'index',
        header: '#',
        meta: { minWidth: 50, className: 'text-center font-medium text-gray-500' },
        cell: ({ row }: any) => (page - 1) * limit + row.index + 1,
      },
      {
        accessorKey: 'email',
        header: 'Email',
        meta: { minWidth: 200, className: 'font-medium text-gray-800' },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { minWidth: 150 },
      },
      {
        accessorKey: 'role',
        header: 'Role',
        meta: { minWidth: 120, className: 'uppercase font-semibold text-center' },
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { minWidth: 280, className: 'text-center' },
        cell: ({ row }: any) => {
          const user: AdminUser = row.original;
          return (
            <UserActions
              user={user}
              onToggleRole={(id, nextRole) => updateRoleMutation.mutate({ id, nextRole })}
              onView={(u) => {
                setSelectedUser(u);
                setUsageOpen(true);
              }}
              onDelete={(id) => deleteUserMutation.mutate(id)}
            />
          );
        },
      },
    ],
    [page, limit, updateRoleMutation, deleteUserMutation],
  );

  return (
    <div className="flex h-full flex-col gap-6 p-6 bg-gray-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">Admin Dashboard</h2>
        <Button variant="neutral" onClick={() => navigate('/c/new')}>
          Back to Chat
        </Button>
      </div>

      {/* Search */}
      <SearchBar
        search={search}
        setSearch={setSearch}
        onSearch={() => {
          setPage(1);
          usersQuery.refetch();
        }}
      />

      {/* Users Table */}
      <div className="rounded-2xl border bg-white shadow-md">
        <DataTable columns={columns as any} data={data} enableRowSelection={false} />
      </div>

      {/* Pagination */}
      <PaginationControls
        page={page}
        total={total}
        limit={limit}
        setPage={setPage}
        onRefresh={() => usersQuery.refetch()}
      />

      {/* Usage Dialog */}
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
