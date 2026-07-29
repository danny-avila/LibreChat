import { useMemo, useState } from 'react';
import {
  Label,
  Input,
  Button,
  Spinner,
  OGDialog,
  DataTable,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogTrigger,
  OGDialogContent,
} from '@librechat/client';
import { useAdminUsageSummaryQuery, useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { formatCost } from '~/utils';

const USAGE_SUMMARY_LIMIT = 100;

export default function UsagePanel() {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const { data: startupConfig } = useGetStartupConfig();
  const { data, isLoading } = useAdminUsageSummaryQuery(
    {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: USAGE_SUMMARY_LIMIT,
    },
    { enabled: isOpen },
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_ui_name')}
          </Label>
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span className="truncate text-sm">
              {row.original.name || row.original.email || row.original.user}
            </span>
            {row.original.name && row.original.email && (
              <span className="truncate text-xs text-text-secondary">{row.original.email}</span>
            )}
          </div>
        ),
        meta: { size: '45%', mobileSize: '55%' },
      },
      {
        accessorKey: 'totalCost',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_ui_admin_usage_cost')}
          </Label>
        ),
        cell: ({ row }) =>
          formatCost(row.original.totalCost / 1_000_000, startupConfig?.interface?.currency),
        meta: { size: '30%', mobileSize: '25%' },
      },
      {
        accessorKey: 'transactionCount',
        header: () => (
          <Label className="px-2 py-0 text-xs sm:px-2 sm:py-2 sm:text-sm">
            {localize('com_ui_admin_usage_transactions')}
          </Label>
        ),
        meta: { size: '25%', mobileSize: '20%' },
      },
    ],
    [localize, startupConfig?.interface?.currency],
  );

  return (
    <OGDialog open={isOpen} onOpenChange={setIsOpen}>
      <OGDialogTrigger asChild onClick={() => setIsOpen(true)}>
        <Button variant="outline">{localize('com_ui_admin_usage')}</Button>
      </OGDialogTrigger>
      <OGDialogContent
        title={localize('com_ui_admin_usage')}
        className="w-11/12 max-w-4xl bg-background text-text-primary shadow-2xl"
      >
        <OGDialogHeader>
          <OGDialogTitle>{localize('com_ui_admin_usage')}</OGDialogTitle>
        </OGDialogHeader>
        <div className="flex flex-wrap items-end gap-3 pb-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="usage-start-date" className="text-xs text-text-secondary">
              {localize('com_ui_admin_usage_start_date')}
            </Label>
            <Input
              id="usage-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="usage-end-date" className="text-xs text-text-secondary">
              {localize('com_ui_admin_usage_end_date')}
            </Label>
            <Input
              id="usage-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
        </div>
        {isLoading && <Spinner className="mx-auto h-6 w-6" />}
        {!isLoading && (data?.items.length ?? 0) === 0 && (
          <p className="py-6 text-center text-sm text-text-secondary">
            {localize('com_ui_admin_usage_empty')}
          </p>
        )}
        {!isLoading && (data?.items.length ?? 0) > 0 && (
          <DataTable
            columns={columns}
            data={data?.items ?? []}
            className="scrollbar-gutter-stable"
            showCheckboxes={false}
            hasNextPage={false}
            isFetchingNextPage={false}
            fetchNextPage={() => Promise.resolve()}
            isLoading={isLoading}
            enableSearch={false}
          />
        )}
      </OGDialogContent>
    </OGDialog>
  );
}
