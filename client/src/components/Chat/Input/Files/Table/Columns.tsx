import { ArrowUpDown, Database } from 'lucide-react';
import { FileSources, FileContext } from 'librechat-data-provider';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { SortFilterHeader } from './SortFilterHeader';
import { OpenAIMinimalIcon } from '~/components/svg';
import { Button, Checkbox } from '~/components/ui';
import { formatDate, getFileType } from '~/utils';

const contextMap = {
  [FileContext.avatar]: 'Avatar',
  [FileContext.unknown]: 'Unknown',
  [FileContext.assistants]: 'Assistants',
  [FileContext.image_generation]: 'Image Gen',
  [FileContext.assistants_output]: 'Assistant Output',
  [FileContext.message_attachment]: 'Attachment',
};

export const columns: ColumnDef<TFile>[] = [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="flex"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="flex"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    meta: {
      size: '150px',
    },
    accessorKey: 'filename',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const file = row.original;
      if (file.type?.startsWith('image')) {
        return (
          <div className="flex gap-2 ">
            <ImagePreview
              url={file.filepath}
              className="h-10 w-10  shrink-0 overflow-hidden  rounded-md"
            />
            <span className="self-center truncate ">{file.filename}</span>
          </div>
        );
      }

      const fileType = getFileType(file.type);
      return (
        <div className="flex gap-2">
          {fileType && <FilePreview fileType={fileType} />}
          <span className="self-center truncate">{file.filename}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
        >
          Date
          <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
        </Button>
      );
    },
    cell: ({ row }) => formatDate(row.original.updatedAt),
  },
  {
    accessorKey: 'source',
    header: ({ column }) => {
      return (
        <SortFilterHeader
          column={column}
          title="Storage"
          filters={{
            Storage: Object.values(FileSources).filter(
              (value) => value === FileSources.local || value === FileSources.openai,
            ),
          }}
          valueMap={{
            [FileSources.openai]: 'OpenAI',
            [FileSources.local]: 'Host',
          }}
        />
      );
    },
    cell: ({ row }) => {
      const { source } = row.original;
      if (source === FileSources.openai) {
        return (
          <div className="flex flex-wrap items-center gap-2">
            <OpenAIMinimalIcon className="icon-sm text-green-600/50" />
            {'OpenAI'}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Database className="icon-sm text-cyan-700" />
          {'Host'}
        </div>
      );
    },
  },
  {
    accessorKey: 'context',
    header: ({ column }) => {
      return (
        <SortFilterHeader
          column={column}
          title="Context"
          filters={{
            Context: Object.values(FileContext).filter(
              (value) => value === FileContext[value ?? ''],
            ),
          }}
          valueMap={contextMap}
        />
      );
    },
    cell: ({ row }) => {
      const { context } = row.original;
      return (
        <div className="flex flex-wrap items-center gap-2">
          {contextMap[context ?? FileContext.unknown] ?? 'Unknown'}
        </div>
      );
    },
  },
  {
    accessorKey: 'bytes',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Size
          <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const suffix = ' MB';
      const value = Number((Number(row.original.bytes) / 1024 / 1024).toFixed(2));
      if (value < 0.01) {
        return '< 0.01 MB';
      }

      return `${value}${suffix}`;
    },
  },
];
