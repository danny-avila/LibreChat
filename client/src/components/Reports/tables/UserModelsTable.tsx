import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@librechat/client';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchTopModelsData } from '~/data-provider/Reports/reportsApi';
import { ModelData, REPORT_LABELS, UserData, useReportStore } from '~/store/reports';
import { formatReportCost } from '~/utils/formatReportCost';

interface UserModelsTableProps {
  users: UserData[];
}

type UserOption = { username: string; label: string };

function formatPeriodLabel(startDate: string, endDate: string): string {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };
  if (startDate && endDate) {
    return `${fmt(startDate)} – ${fmt(endDate)}`;
  }
  if (startDate) {
    return `a partir de ${fmt(startDate)}`;
  }
  if (endDate) {
    return `até ${fmt(endDate)}`;
  }
  return 'últimos 30 dias (padrão da API)';
}

function UserModelsTable({ users }: UserModelsTableProps) {
  const startDate = useReportStore((s) => s.filters.startDate);
  const endDate = useReportStore((s) => s.filters.endDate);

  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [query, setQuery] = useState('');
  const [listOpen, setListOpen] = useState(false);
  const [data, setData] = useState<ModelData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([{ id: 'Custo', desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const containerRef = useRef<HTMLDivElement>(null);

  const userOptions = useMemo(() => {
    const seen = new Set<string>();
    const options: UserOption[] = [];
    for (const u of users) {
      if (!u.username || seen.has(u.username)) {
        continue;
      }
      seen.add(u.username);
      const label = u.name?.trim() ? `${u.name.trim()} (@${u.username})` : u.username;
      options.push({ username: u.username, label });
    }
    return options.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [users]);

  const filteredUserOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return userOptions;
    }
    return userOptions.filter(
      (o) => o.label.toLowerCase().includes(q) || o.username.toLowerCase().includes(q),
    );
  }, [userOptions, query]);

  const periodLabel = useMemo(() => formatPeriodLabel(startDate, endDate), [startDate, endDate]);

  const loadUserModels = useCallback(async () => {
    if (!selectedUser) {
      setData([]);
      return;
    }
    setIsLoading(true);
    try {
      const result = await fetchTopModelsData({
        user: selectedUser.username,
        startDate,
        endDate,
        limit: null,
      });
      const sorted = [...result].sort((a, b) => (b.Custo ?? 0) - (a.Custo ?? 0));
      setData(sorted);
    } catch {
      setData([]);
    } finally {
      setIsLoading(false);
    }
  }, [selectedUser, startDate, endDate]);

  useEffect(() => {
    loadUserModels();
  }, [loadUserModels]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setListOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectUser = (option: UserOption) => {
    setSelectedUser(option);
    setQuery(option.label);
    setListOpen(false);
  };

  const clearUser = () => {
    setSelectedUser(null);
    setQuery('');
    setData([]);
  };

  const columns: ColumnDef<ModelData>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 text-gray-300 hover:text-white"
          >
            Modelo
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium text-white">{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'Volume',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 text-gray-300 hover:text-white"
          >
            Mensagens
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-left font-bold text-blue-400">
            {(row.getValue('Volume') as number).toLocaleString('pt-BR')}
          </div>
        ),
      },
      {
        accessorKey: 'Custo',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-auto p-0 text-gray-300 hover:text-white"
          >
            Custo total
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="text-left font-bold text-green-400">
            {formatReportCost(row.getValue('Custo') as number)}
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data,
    columns,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { sorting, pagination },
  });

  useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [selectedUser?.username, data.length]);

  const totalRows = data.length;
  const totalFiltered = table.getRowModel().rows.length;
  const currentPage = pagination.pageIndex + 1;
  const totalPages = Math.max(table.getPageCount(), 1);
  const startItem = totalRows === 0 ? 0 : pagination.pageIndex * pagination.pageSize + 1;
  const endItem = Math.min(startItem + pagination.pageSize - 1, totalRows);

  return (
    <div className="rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">{REPORT_LABELS.TABLES.USER_MODELS}</h3>
        <p className="text-sm text-gray-400">
          Período: <span className="text-gray-300">{periodLabel}</span>
          {selectedUser ? (
            <>
              {' '}
              · <span className="text-gray-300">@{selectedUser.username}</span>
            </>
          ) : null}
        </p>
      </div>

      <div ref={containerRef} className="relative mb-4 max-w-xl">
        <label className="mb-1 block text-xs text-gray-400">Usuário</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setListOpen(true);
              if (selectedUser && e.target.value !== selectedUser.label) {
                setSelectedUser(null);
              }
            }}
            onFocus={() => setListOpen(true)}
            placeholder="Buscar e selecionar usuário..."
            className="w-full rounded-lg border border-gray-600/50 bg-gray-800/50 py-2 pl-10 pr-10 text-sm text-white placeholder:text-gray-400 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            autoComplete="off"
            role="combobox"
            aria-expanded={listOpen}
            aria-controls="user-models-listbox"
          />
          {selectedUser && (
            <button
              type="button"
              onClick={clearUser}
              className="absolute right-3 top-2 text-xs text-gray-400 hover:text-white"
              aria-label="Limpar usuário"
            >
              ✕
            </button>
          )}
        </div>

        {listOpen && filteredUserOptions.length > 0 && (
          <ul
            id="user-models-listbox"
            role="listbox"
            className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-600/50 bg-gray-900 py-1 shadow-lg"
          >
            {filteredUserOptions.map((o) => (
              <li key={o.username} role="option">
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-800"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => selectUser(o)}
                >
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}

        {listOpen && query.trim() && filteredUserOptions.length === 0 && (
          <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-600/50 bg-gray-900 px-3 py-2 text-sm text-gray-500">
            Nenhum usuário encontrado.
          </div>
        )}
      </div>

      {!selectedUser && (
        <div className="flex h-24 items-center justify-center text-sm text-gray-500">
          Busque e selecione um usuário para ver os modelos no período acima.
        </div>
      )}

      {selectedUser && isLoading && (
        <div className="flex h-32 items-center justify-center text-gray-400">Carregando...</div>
      )}

      {selectedUser && !isLoading && totalRows === 0 && (
        <div className="flex h-24 items-center justify-center text-sm text-gray-500">
          Nenhum uso de modelo neste período.
        </div>
      )}

      {selectedUser && !isLoading && totalRows > 0 && (
        <>
          <p className="mb-3 text-sm text-gray-400">
            {startItem}-{endItem} de {totalFiltered} modelos · ordenado por custo (maior primeiro)
          </p>
          <div className="overflow-x-auto rounded-lg border border-gray-700/30">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-gray-700/50 hover:bg-transparent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-gray-300">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id} className="border-gray-700/30 hover:bg-gray-800/30">
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage()}
                className="border-gray-600 text-gray-300"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm text-gray-400">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage()}
                className="border-gray-600 text-gray-300"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default memo(UserModelsTable);
