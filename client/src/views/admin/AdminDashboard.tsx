import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { QueryKeys, request } from 'librechat-data-provider';
import DataTable from '~/components/ui/DataTable';
import { Button } from '~/components/ui/Button';
import { SearchBar } from '~/views/admin/AdminSearchBar';
import { PaginationControls } from '~/views/admin/PaginationControls';
import { UserActions } from '~/views/admin/UserActions';
import { UserUsageDialog } from '~/views/admin/UserUsageDialog';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '~/components/ui/Pagination';

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

  // Adjust container height when data changes
  useEffect(() => {
    const adjustTableHeight = () => {
      if (mainContainerRef.current) {
        const windowHeight = window.innerHeight;
        const containerTop = mainContainerRef.current.getBoundingClientRect().top;
        const paginationHeight = 60; // Estimated height for pagination
        const headerHeight = 60; // Estimated height for the header
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
          return (
            <span
              className={[
                'rounded px-2 py-0.5 text-xs font-medium',
                role === 'ADMIN'
                  ? 'bg-purple-100 text-purple-700'
                  : role === 'USER'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-700',
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
          <h2 className="text-xl font-semibold">User Management</h2>
          <div className="text-sm text-gray-500">
            {data.length > 0
              ? `Showing ${(page - 1) * limit + 1}-${Math.min(page * limit, total)} of ${total}`
              : 'No users'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={() => navigate('/c/new')}>
            Back to Chat
          </Button>
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
      <div
        ref={mainContainerRef}
        className="flex-grow overflow-hidden rounded-md border border-gray-200 dark:border-gray-700"
      >
        <DataTable
          columns={columns as any}
          data={data.map((r, i) => ({ ...r, id: r._id || i }))}
          className="h-full"
          enableRowSelection={false}
          showCheckboxes={false}
          onDelete={undefined}
        />
      </div>

      {/* Pagination */}
      {total > limit && (
        <Pagination className="mt-2 border-t border-gray-200 py-3 dark:border-gray-700">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                className={page === 1 ? 'pointer-events-none opacity-50' : ''}
              />
            </PaginationItem>

            {Array.from({ length: Math.min(5, Math.ceil(total / limit)) }, (_, i) => {
              const pageNumber = i + 1;
              const isCurrentPage = pageNumber === page;

              // Show first page, last page, current page, and pages around current
              if (
                pageNumber === 1 ||
                pageNumber === Math.ceil(total / limit) ||
                (pageNumber >= page - 1 && pageNumber <= page + 1)
              ) {
                return (
                  <PaginationItem key={pageNumber}>
                    <PaginationLink
                      isActive={isCurrentPage}
                      onClick={() => setPage(pageNumber)}
                    >
                      {pageNumber}
                    </PaginationLink>
                  </PaginationItem>
                );
              }

              // Show ellipsis for gaps
              if (
                (pageNumber === 2 && page > 3) ||
                (pageNumber === Math.ceil(total / limit) - 1 &&
                  page < Math.ceil(total / limit) - 2)
              ) {
                return (
                  <PaginationItem key={`ellipsis-${pageNumber}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                );
              }

              return null;
            })}

            <PaginationItem>
              <PaginationNext
                onClick={() =>
                  setPage((prev) => Math.min(prev + 1, Math.ceil(total / limit)))
                }
                className={
                  page === Math.ceil(total / limit)
                    ? 'pointer-events-none opacity-50'
                    : ''
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
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
