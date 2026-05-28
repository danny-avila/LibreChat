import { memo } from 'react';
import { Spinner } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useAdminUsageQuery } from '~/data-provider';

function formatCredits(value: number): string {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value);
}

function Usage() {
  const localize = useLocalize();
  const { data, isLoading, isError } = useAdminUsageQuery();

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        <Spinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-full w-full items-center justify-center text-text-secondary">
        {localize('com_usage_error')}
      </div>
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="flex h-full w-full flex-col gap-4 overflow-y-auto bg-surface-primary px-8 py-6">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">
          {localize('com_usage_title')}
        </h1>
        <p className="text-sm text-text-secondary">{localize('com_usage_subtitle')}</p>
      </header>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-border-light p-8 text-center text-text-secondary">
          {localize('com_usage_empty')}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border-light">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-surface-secondary text-text-secondary">
              <tr>
                <th className="px-4 py-3 font-medium">{localize('com_usage_col_user')}</th>
                <th className="px-4 py-3 font-medium">{localize('com_usage_col_email')}</th>
                <th className="px-4 py-3 font-medium">{localize('com_usage_col_bu')}</th>
                <th className="px-4 py-3 text-right font-medium">
                  {localize('com_usage_col_credits')}
                </th>
                <th className="px-4 py-3 text-right font-medium">
                  {localize('com_usage_col_messages')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.user} className="border-t border-border-light text-text-primary">
                  <td className="px-4 py-3">{row.name ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.email ?? '—'}</td>
                  <td className="px-4 py-3 text-text-secondary">{row.tenantId ?? '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {formatCredits(row.totalCredits)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{row.messageCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default memo(Usage);
