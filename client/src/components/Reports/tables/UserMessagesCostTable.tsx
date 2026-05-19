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
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  PaginationState,
  SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight, DollarSign, Search } from 'lucide-react';
import React, { memo, useMemo } from 'react';
import { REPORT_LABELS, UserData } from '~/store/reports';
import { formatReportCost } from '~/utils/formatReportCost';

interface UserMessagesTableProps {
  data: UserData[];
  isLoading?: boolean;
}

function UserMessagesTable({ data, isLoading }: UserMessagesTableProps) {
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'Volume', desc: true }]);
  const [globalFilter, setGlobalFilter] = React.useState('');
  const [costFilter, setCostFilter] = React.useState({ min: '', max: '' });
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  // Função de filtro customizada para custo
  const costFilterFn = React.useCallback(
    (row: any) => {
      const cost = row.Custo as number;
      const minCost = costFilter.min ? parseFloat(costFilter.min) : 0;
      const maxCost = costFilter.max ? parseFloat(costFilter.max) : Infinity;

      return cost >= minCost && cost <= maxCost;
    },
    [costFilter],
  );

  // Aplicar filtro customizado aos dados
  const filteredData = React.useMemo(() => {
    if (!costFilter.min && !costFilter.max) {
      return data;
    }
    return data.filter(costFilterFn);
  }, [data, costFilterFn]);

  const columns: ColumnDef<UserData>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 h-auto text-gray-300 hover:text-white"
          >
            Nome
            <ArrowUpDown className="ml-2 w-4 h-4" />
          </Button>
        ),
        cell: ({ row }) => <div className="font-medium text-white">{row.getValue('name')}</div>,
      },
      {
        accessorKey: 'username',
        header: 'Username',
        cell: ({ row }) => (
          <div className="font-mono text-gray-300">@{row.getValue('username')}</div>
        ),
      },
      {
        accessorKey: 'costCenter',
        header: 'CC',
        cell: ({ row }) => (
          <div className="font-medium text-left text-yellow-400">
            {row.getValue('costCenter') || 'N/A'}
          </div>
        ),
      },
      {
        accessorKey: 'Volume',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="p-0 h-auto text-gray-300 hover:text-white"
          >
            Volume
            <ArrowUpDown className="ml-2 w-4 h-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-bold text-left text-blue-400">
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
            className="p-0 h-auto text-gray-300 hover:text-white"
          >
            Custo
            <ArrowUpDown className="ml-2 w-4 h-4" />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="font-bold text-left text-green-400">
            {formatReportCost(row.getValue('Custo') as number)}
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredData,
    columns,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    globalFilterFn: 'includesString',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      globalFilter,
      pagination,
    },
  });

  // Resetar paginação quando filtros mudam
  React.useEffect(() => {
    setPagination((prev) => ({ ...prev, pageIndex: 0 }));
  }, [globalFilter, costFilter]);

  // Calcular informações de paginação
  const totalFiltered = table.getFilteredRowModel().rows.length;
  const totalData = data.length;
  const currentPage = pagination.pageIndex + 1;
  const totalPages = table.getPageCount();
  const startItem = pagination.pageIndex * pagination.pageSize + 1;
  const endItem = Math.min(startItem + pagination.pageSize - 1, totalFiltered);

  // Função para limpar filtros de custo
  const clearCostFilter = () => {
    setCostFilter({ min: '', max: '' });
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-5">
        <div className="flex justify-center items-center h-32">
          <div className="text-gray-400">Carregando dados...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-gray-700/50 bg-[#1c1c1c] p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          {REPORT_LABELS.TABLES.USER_MESSAGES_COST}
        </h3>
        <p className="text-sm text-gray-400">
          {totalFiltered > 0
            ? `${startItem}-${endItem} de ${totalFiltered} usuários` +
              (totalFiltered !== totalData ? ` (filtrado de ${totalData})` : '')
            : `0 de ${totalData} usuários`}
        </p>
      </div>

      {/* Filtros */}
      <div className="mb-4 space-y-4">
        {/* Campo de Pesquisa */}
        <div className="relative">
          <Search className="absolute top-3 left-3 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Pesquisar usuários..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="py-2 pr-4 pl-10 w-full text-white rounded-lg border border-gray-600/50 bg-gray-800/50 placeholder:text-gray-400 focus:border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          />
        </div>

        {/* Filtro por Custo */}
        <div className="flex gap-4 items-center">
          <div className="flex gap-2 items-center text-gray-300">
            <DollarSign className="w-4 h-4" />
            <span className="text-sm font-medium">Filtrar por Custo:</span>
          </div>

          <div className="flex gap-2 items-center">
            <input
              type="number"
              placeholder="Min"
              value={costFilter.min}
              onChange={(e) => setCostFilter((prev) => ({ ...prev, min: e.target.value }))}
              className="w-24 rounded border border-gray-600/50 bg-gray-800/50 px-3 py-1.5 text-sm text-white placeholder:text-gray-400 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/50"
              step="0.01"
              min="0"
            />

            <span className="text-sm text-gray-400">até</span>

            <input
              type="number"
              placeholder="Max"
              value={costFilter.max}
              onChange={(e) => setCostFilter((prev) => ({ ...prev, max: e.target.value }))}
              className="w-24 rounded border border-gray-600/50 bg-gray-800/50 px-3 py-1.5 text-sm text-white placeholder:text-gray-400 focus:border-green-500/50 focus:outline-none focus:ring-2 focus:ring-green-500/50"
              step="0.01"
              min="0"
            />
          </div>

          {(costFilter.min || costFilter.max) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCostFilter}
              className="text-xs text-gray-400 hover:text-white"
            >
              Limpar
            </Button>
          )}
        </div>

        {/* Indicador de Filtros Ativos */}
        {(costFilter.min || costFilter.max) && (
          <div className="flex gap-2 items-center text-xs">
            <span className="text-gray-400">Filtros ativos:</span>
            <span className="px-2 py-1 text-green-400 rounded bg-green-500/20">
              Custo: ${costFilter.min || '0'} - ${costFilter.max || '∞'}
            </span>
          </div>
        )}
      </div>

      <div className="rounded-md border border-gray-700/50">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="border-gray-700/50 hover:bg-gray-800/30">
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
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} className="border-gray-700/50 hover:bg-gray-800/30">
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-24 text-center text-gray-400">
                  Nenhum resultado encontrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Controles de Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center px-2 py-4">
          <div className="text-sm text-gray-400">
            Página {currentPage} de {totalPages}
          </div>

          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="text-gray-300 border-gray-600/50 bg-gray-800/50 hover:bg-gray-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ChevronLeft className="mr-1 w-4 h-4" />
              Anterior
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="text-gray-300 border-gray-600/50 bg-gray-800/50 hover:bg-gray-700/50 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Próxima
              <ChevronRight className="ml-1 w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(UserMessagesTable);
