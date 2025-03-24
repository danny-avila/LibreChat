import { ArrowUpDown } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import type { TFile } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';
import PanelFileCell from './PanelFileCell';
import { Button } from '~/components/ui';
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
