import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QueryKeys, request } from 'librechat-data-provider';
import DataTable from '~/components/ui/DataTable';
import { Button } from '~/components/ui/Button';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import { UserActions } from '~/views/admin/UserActions';
import { UserUsageDialog } from '~/views/admin/UserUsageDialog';
import { ArrowLeft } from 'lucide-react';
import {Pagination} from '~/components/ui/Pagination';

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
  const mainContainerRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit] = useState(10); // Show 10 users per page
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
    onSuccess: () => {
      const totalPages = Math.ceil((usersQuery.data as any)?.total / limit) || 1;
      if (page > totalPages && page !== 1) {
        setPage(1);
      }
    },
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

  // Adjust container height when data changes
  useEffect(() => {
    const adjustTableHeight = () => {
      if (mainContainerRef.current) {
        const windowHeight = window.innerHeight;
        const containerTop = mainContainerRef.current.getBoundingClientRect().top;
        const paginationHeight = 60;
        const headerHeight = 60;
        const availableHeight = windowHeight - containerTop - paginationHeight - headerHeight;
        mainContainerRef.current.style.height = `${Math.max(400, availableHeight)}px`;
      }
    };
    setTimeout(adjustTableHeight, 100);
    window.addEventListener('resize', adjustTableHeight);
    return () => window.removeEventListener('resize', adjustTableHeight);
  }, [data, page]);

  // --- Columns for DataTable ---
  const columns = useMemo(
    () => [
      {
        id: 'index',
        header: 'No.',
        meta: { size: '60px' },
        cell: ({ row }: any) => (
          <span className="text-xs font-medium text-gray-500">
            {(page - 1) * limit + row.index + 1}
          </span>
        ),
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }: any) => row.original.email ?? '—',
        meta: { size: '220px' },
      },
      {
        accessorKey: 'name',
        header: 'Name',
        cell: ({ row }: any) => row.original.name ?? '—',
        meta: { size: '180px' },
      },
      {
        accessorKey: 'role',
        header: 'Role',
        meta: { size: '120px' },
        cell: ({ row }: any) => {
          const role = row.original.role;
          const normalizedRole = String(role).trim();
          const isAdmin = normalizedRole.toLowerCase() === 'admin';
          const isUser = normalizedRole.toLowerCase() === 'user';

          return (
            <span
              className={[
                'inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium',
                isAdmin
                  ? 'bg-green-100 !text-green-700 dark:bg-green-900 dark:!text-green-300'
                  : isUser
                  ? 'bg-blue-100 !text-blue-700 dark:bg-blue-900 dark:!text-blue-300'
                  : 'bg-slate-100 !text-slate-700 dark:bg-slate-800 dark:!text-slate-300',
              ].join(' ')}
            >
              {role}
            </span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: 'Created',
        meta: { size: '150px' },
        cell: ({ row }: any) => (
          <span className="text-xs">
            {row.original.createdAt ? new Date(row.original.createdAt).toLocaleDateString() : '—'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        meta: { size: '200px' },
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
    <div className="flex h-full flex-col gap-4 p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between border-b border-gray-200 pb-3">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/c/new')}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h2 className="text-xl font-semibold">User Management</h2>
        </div>
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
      <div ref={mainContainerRef} className="flex-grow overflow-hidden">
        <DataTable
          columns={columns as any}
          data={data.map((r, i) => ({ ...r, id: r._id || i }))}
          className="flex h-full flex-col gap-4"
          enableRowSelection={false}
          showCheckboxes={false}
          onDelete={undefined}
        />
      </div>

      {/* Pagination (reusable component) */}
      {total > 0 && (
        <Pagination
          page={page}
          limit={limit}
          total={total}
          data={data}
          onPageChange={setPage}
        />
      )}

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
