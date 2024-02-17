import { ArrowUpDown } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import PanelFileCell from './PanelFileCell';
import { Button } from '~/components/ui';
import { formatDate } from '~/utils';

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
    cell: ({ row }) => <PanelFileCell row={row} />,
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
