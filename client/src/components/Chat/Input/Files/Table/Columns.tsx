/* eslint-disable react-hooks/rules-of-hooks */
import { ArrowUpDown, Database } from 'lucide-react';
import { FileSources, FileContext } from 'librechat-data-provider';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import { Button, Checkbox, OpenAIMinimalIcon, AzureMinimalIcon } from '~/components';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { SortFilterHeader } from './SortFilterHeader';
import { useLocalize, useMediaQuery } from '~/hooks';
import { formatDate, getFileType } from '~/utils';

const contextMap = {
  [FileContext.avatar]: 'com_ui_avatar',
  [FileContext.unknown]: 'com_ui_unknown',
  [FileContext.assistants]: 'com_ui_assistants',
  [FileContext.image_generation]: 'com_ui_image_gen',
  [FileContext.assistants_output]: 'com_ui_assistants_output',
  [FileContext.message_attachment]: 'com_ui_attachment',
};

export const columns: ColumnDef<TFile>[] = [
  {
    id: 'select',
    header: ({ table }) => {
      return (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && 'indeterminate')
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
          className="flex"
        />
      );
    },
    cell: ({ row }) => {
      return (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="flex"
        />
      );
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    meta: {
      size: '150px',
    },
    accessorKey: 'filename',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <Button
          variant="ghost"
          className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          {localize('com_ui_name')}
          <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const file = row.original;
      if (file.type.startsWith('image')) {
        return (
          <div className="flex gap-2">
            <ImagePreview
              url={file.filepath}
              className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md"
              source={file.source}
            />
            <span className="self-center truncate ">{file.filename}</span>
          </div>
        );
      }

      const fileType = getFileType(file.type);
      return (
        <div className="flex gap-2">
          {fileType && <FilePreview fileType={fileType} className="relative" file={file} />}
          <span className="self-center truncate">{file.filename}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
        >
          {localize('com_ui_date')}
          <ArrowUpDown className="ml-2 h-3 w-4 sm:h-4 sm:w-4" />
        </Button>
      );
    },
    cell: ({ row }) => {
      const isSmallScreen = useMediaQuery('(max-width: 768px)');
      return formatDate(row.original.updatedAt?.toString() ?? '', isSmallScreen);
    },
  },
  {
    accessorKey: 'filterSource',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <SortFilterHeader
          column={column}
          title={localize('com_ui_storage')}
          filters={{
            Storage: Object.values(FileSources).filter(
              (value) =>
                value === FileSources.local ||
                value === FileSources.openai ||
                value === FileSources.azure,
            ),
          }}
          valueMap={{
            [FileSources.azure]: 'Azure',
            [FileSources.openai]: 'OpenAI',
            [FileSources.local]: 'com_ui_host',
          }}
        />
      );
    },
    cell: ({ row }) => {
      const localize = useLocalize();
      const { source } = row.original;
      if (source === FileSources.openai) {
        return (
          <div className="flex flex-wrap items-center gap-2">
            <OpenAIMinimalIcon className="icon-sm text-green-600/50" />
            {'OpenAI'}
          </div>
        );
      } else if (source === FileSources.azure) {
        return (
          <div className="flex flex-wrap items-center gap-2">
            <AzureMinimalIcon className="icon-sm text-cyan-700" />
            {'Azure'}
          </div>
        );
      }
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Database className="icon-sm text-cyan-700" />
          {localize('com_ui_host')}
        </div>
      );
    },
  },
  {
    accessorKey: 'context',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <SortFilterHeader
          column={column}
          title={localize('com_ui_context')}
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
      const localize = useLocalize();
      return (
        <div className="flex flex-wrap items-center gap-2">
          {localize(contextMap[context ?? FileContext.unknown] ?? 'com_ui_unknown')}
        </div>
      );
    },
  },
  {
    accessorKey: 'bytes',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <Button
          variant="ghost"
          className="px-2 py-0 text-xs hover:bg-surface-hover sm:px-2 sm:py-2 sm:text-sm"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          {localize('com_ui_size')}
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
