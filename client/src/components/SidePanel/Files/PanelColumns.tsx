/* eslint-disable react-hooks/rules-of-hooks */
import { ArrowUpDown } from 'lucide-react';
import { Button } from '@librechat/client';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import PanelFileCell from './PanelFileCell';
import { useLocalize } from '~/hooks';
import { formatDate } from '~/utils';

export const columns: ColumnDef<TFile | undefined>[] = [
  {
    accessorKey: 'filename',
    header: ({ column }) => {
      const localize = useLocalize();
      return (
        <Button
          variant="ghost"
          className="hover:bg-surface-hover"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={localize('com_ui_name')}
        >
          {localize('com_ui_name')}
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
      const localize = useLocalize();
      return (
        <Button
          variant="ghost"
          className="hover:bg-surface-hover"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          aria-label={localize('com_ui_date')}
        >
          {localize('com_ui_date')}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      );
    },
    cell: ({ row }) => (
      <span className="flex justify-end text-xs">
        {formatDate(row.original?.updatedAt?.toString() ?? '')}
      </span>
    ),
  },
];
