/* eslint-disable react-hooks/rules-of-hooks */
import { PlusIcon } from 'lucide-react';
import { Button, Checkbox, DotsIcon, FileIcon } from '@librechat/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import { formatDate, getFileType } from '~/utils';
import { useLocalize } from '~/hooks';

export const fileTableColumns: ColumnDef<TFile>[] = [
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
      size: '50px',
    },
    accessorKey: 'icon',
    header: () => {
      return 'Icon';
    },
    cell: ({ row }) => {
      const file = row.original;
      return <FileIcon file={file} fileType={getFileType(file.type)} />;
    },
  },
  {
    meta: {
      size: '150px',
    },
    accessorKey: 'filename',
    header: ({ column }) => {
      const localize = useLocalize();
      return <>{localize('com_ui_name')}</>;
    },
    cell: ({ row }) => {
      const file = row.original;
      return <span className="self-center truncate">{file.filename}</span>;
    },
  },
  {
    accessorKey: 'vectorStores',
    header: () => {
      return 'Vector Stores';
    },
    cell: ({ row }) => {
      const { vectorsAttached: attachedVectorStores } = row.original;
      return (
        <>
          {attachedVectorStores.map((vectorStore, index) => {
            if (index === 4) {
              return (
                <span
                  key={index}
                  className="ml-2 mt-2 flex w-fit flex-row items-center rounded-full bg-[#f5f5f5] px-2 text-gray-500"
                >
                  <PlusIcon className="h-3 w-3" />
                  &nbsp;
                  {attachedVectorStores.length - index} more
                </span>
              );
            }
            if (index > 4) {
              return null;
            }
            return (
              <span key={index} className="ml-2 mt-2 rounded-full bg-[#f2f8ec] px-2 text-[#91c561]">
                {vectorStore.name}
              </span>
            );
          })}
        </>
      );
    },
  },
  {
    accessorKey: 'updatedAt',
    header: () => {
      const localize = useLocalize();
      return 'Modified';
    },
    cell: ({ row }) => formatDate(row.original.updatedAt),
  },
  {
    accessorKey: 'actions',
    header: () => {
      return 'Actions';
    },
    cell: ({ row }) => {
      return (
        <>
          <Button className="w-min content-center bg-transparent text-gray-500 hover:bg-slate-200">
            <DotsIcon className="text-grey-100 m-0 size-5 p-0" />
          </Button>
        </>
      );
    },
  },
];
