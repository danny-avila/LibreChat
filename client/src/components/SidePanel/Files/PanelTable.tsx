import { useState, useCallback, useMemo } from 'react';
import { ArrowUpLeft } from 'lucide-react';
import { useSetRecoilState } from 'recoil';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
  type ColumnFiltersState,
} from '@tanstack/react-table';
import {
  fileConfig as defaultFileConfig,
  checkOpenAIStorage,
  mergeFileConfig,
  megabyte,
  isAssistantsEndpoint,
  type TFile,
} from 'librechat-data-provider';

import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import { useFileMapContext, useChatContext, useToastContext } from '~/Providers';
import { useLocalize, useUpdateFiles } from '~/hooks';
import { useGetFileConfig } from '~/data-provider';
import store from '~/store';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export default function DataTable<TData, TValue>({ columns, data }: DataTableProps<TData, TValue>) {
  const localize = useLocalize();
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [{ pageIndex, pageSize }, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const setShowFiles = useSetRecoilState(store.showFiles);

  const pagination = useMemo(
    () => ({
      pageIndex,
      pageSize,
    }),
    [pageIndex, pageSize],
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      pagination,
    },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    getPaginationRowModel: getPaginationRowModel(),
    defaultColumn: {
      minSize: 0,
      size: 10,
      maxSize: 10,
      enableResizing: true,
    },
  });

  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const { setFiles, conversation } = useChatContext();
  const { data: fileConfig = defaultFileConfig } = useGetFileConfig({
    select: (data) => mergeFileConfig(data),
  });
  const { addFile } = useUpdateFiles(setFiles);

  const handleFileClick = useCallback(
    (file: TFile) => {
      if (!fileMap?.[file.file_id] || !conversation?.endpoint) {
        showToast({
          message: localize('com_ui_attach_error'),
          status: 'error',
        });
        return;
      }

      const fileData = fileMap[file.file_id];
      const endpoint = conversation.endpoint;

      if (!fileData.source) {
        return;
      }

      const isOpenAIStorage = checkOpenAIStorage(fileData.source);
      const isAssistants = isAssistantsEndpoint(endpoint);

      if (isOpenAIStorage && !isAssistants) {
        showToast({
          message: localize('com_ui_attach_error_openai'),
          status: 'error',
        });
        return;
      }

      if (!isOpenAIStorage && isAssistants) {
        showToast({
          message: localize('com_ui_attach_warn_endpoint'),
          status: 'warning',
        });
      }

      const { fileSizeLimit, supportedMimeTypes } =
        fileConfig.endpoints[endpoint] ?? fileConfig.endpoints.default;

      if (fileData.bytes > fileSizeLimit) {
        showToast({
          message: `${localize('com_ui_attach_error_size')} ${
            fileSizeLimit / megabyte
          } MB (${endpoint})`,
          status: 'error',
        });
        return;
      }

      if (!defaultFileConfig.checkType(file.type, supportedMimeTypes)) {
        showToast({
          message: `${localize('com_ui_attach_error_type')} ${file.type} (${endpoint})`,
          status: 'error',
        });
        return;
      }

      addFile({
        progress: 1,
        attached: true,
        file_id: fileData.file_id,
        filepath: fileData.filepath,
        preview: fileData.filepath,
        type: fileData.type,
        height: fileData.height,
        width: fileData.width,
        filename: fileData.filename,
        source: fileData.source,
        size: fileData.bytes,
      });
    },
    [addFile, fileMap, conversation, localize, showToast, fileConfig.endpoints],
  );

  const filenameFilter = table.getColumn('filename')?.getFilterValue() as string;

  return (
    <div role="region" aria-label={localize('com_files_table')} className="mt-2 space-y-2">
      <div className="flex items-center gap-4">
        <Input
          placeholder={localize('com_files_filter')}
          value={filenameFilter ?? ''}
          onChange={(event) => table.getColumn('filename')?.setFilterValue(event.target.value)}
          aria-label={localize('com_files_filter')}
        />
      </div>

      <div className="rounded-lg border border-border-light bg-transparent shadow-2xs transition-colors">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="border-b border-border-light">
                  {headerGroup.headers.map((header, index) => (
                    <TableHead
                      key={header.id}
                      style={{ width: index === 0 ? '75%' : '25%' }}
                      className="bg-surface-secondary py-3 text-left text-sm font-medium text-text-secondary"
                    >
                      <div className="px-4">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && 'selected'}
                    className="border-b border-border-light transition-colors hover:bg-surface-secondary last:border-0"
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isFilenameCell = cell.column.id === 'filename';

                      return (
                        <TableCell
                          style={{
                            width: '150px',
                            maxWidth: '150px',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          data-skip-refocus="true"
                          key={cell.id}
                          role={isFilenameCell ? 'button' : undefined}
                          tabIndex={isFilenameCell ? 0 : undefined}
                          onClick={(e) => {
                            if (isFilenameCell) {
                              const clickedElement = e.target as HTMLElement;
                              // Check if clicked element is within cell and not a button/link
                              if (
                                clickedElement.closest('td') &&
                                !clickedElement.closest('button, a')
                              ) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleFileClick(row.original as TFile);
                              }
                            }
                          }}
                          onKeyDown={(e) => {
                            if (isFilenameCell && (e.key === 'Enter' || e.key === ' ')) {
                              const clickedElement = e.target as HTMLElement;
                              if (
                                clickedElement.closest('td') &&
                                !clickedElement.closest('button, a')
                              ) {
                                e.preventDefault();
                                e.stopPropagation();
                                handleFileClick(row.original as TFile);
                              }
                            }
                          }}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center text-sm text-text-secondary"
                  >
                    {localize('com_files_no_results')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowFiles(true)}
          aria-label={localize('com_sidepanel_manage_files')}
        >
          <ArrowUpLeft className="h-4 w-4" aria-hidden="true" />
          <span className="ml-2">{localize('com_sidepanel_manage_files')}</span>
        </Button>

        <div className="flex items-center gap-2" role="navigation" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            aria-label={localize('com_ui_prev')}
          >
            {localize('com_ui_prev')}
          </Button>
          <div aria-live="polite" className="text-sm">
            {`${pageIndex + 1} / ${table.getPageCount()}`}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            aria-label={localize('com_ui_next')}
          >
            {localize('com_ui_next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
