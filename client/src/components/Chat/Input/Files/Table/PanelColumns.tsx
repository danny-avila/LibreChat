import { ArrowUpDown } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import ImagePreview from '~/components/Chat/Input/Files/ImagePreview';
import FilePreview from '~/components/Chat/Input/Files/FilePreview';
import { formatDate, getFileType } from '~/utils';
import { Button } from '~/components/ui';

export const columns: ColumnDef<TFile>[] = [
  {
    accessorKey: 'filename',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    meta: {
      size: '150px',
    },
    cell: ({ row }) => {
      const file = row.original;
      if (file.type?.startsWith('image')) {
        return (
          <div className="flex cursor-pointer gap-2 rounded-md dark:hover:bg-gray-900">
            <ImagePreview
              url={file.filepath}
              className="h-10 w-10 shrink-0 overflow-hidden rounded-md"
            />
            <span className="self-center truncate text-xs">{file.filename}</span>
          </div>
        );
      }

      const fileType = getFileType(file.type);
      return (
        <div className="flex cursor-pointer gap-2 rounded-md dark:hover:bg-gray-900">
          {fileType && <FilePreview fileType={fileType} />}
          <span className="self-center truncate">{file.filename}</span>
        </div>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    meta: {
      size: '10%',
    },
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          Date
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span className="flex justify-end text-xs">{formatDate(row.original.updatedAt)}</span>
    ),
  },
];
