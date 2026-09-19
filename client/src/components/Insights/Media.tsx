import { Button } from '@librechat/client';
import { useTranslation } from 'react-i18next';
import type { TMediaInsights } from 'librechat-data-provider';
import { Panel, EmptyState } from './Panel';

const operationLabel = (operation: string) => {
  if (operation === 'image.edit') return 'com_media_image_edit';
  if (operation === 'video.generate') return 'com_media_video_generate';
  return 'com_media_image_generate';
};
import { useLocalize } from '~/hooks';

export default function MediaInsights({
  data,
  isFetching,
  onPage,
}: {
  data: TMediaInsights;
  isFetching: boolean;
  onPage(page: number): void;
}) {
  const localize = useLocalize();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? i18n.language;
  const money = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 4,
  });
  const number = new Intl.NumberFormat(locale);
  const totals = [
    ['com_insights_media_submitted', data.summary.submitted],
    ['com_insights_media_completed', data.summary.completed],
    ['com_insights_media_failed', data.summary.failed],
    ['com_insights_media_cancelled', data.summary.cancelled],
    ['com_insights_media_uncertain', data.summary.uncertain],
    ['com_insights_media_active', data.summary.active],
  ] as const;
  return (
    <Panel aria-labelledby="media-insights-title">
      <h2 id="media-insights-title" className="text-base font-semibold">
        {localize('com_insights_media_title')}
      </h2>
      <p className="mt-1 text-sm text-text-secondary">{localize('com_insights_media_scope')}</p>
      <dl className="my-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {totals.map(([key, value]) => (
          <div key={key}>
            <dt className="text-sm text-text-secondary">{localize(key)}</dt>
            <dd className="text-xl font-semibold tabular-nums">{number.format(value)}</dd>
          </div>
        ))}
      </dl>
      <p className="mb-3 text-sm text-text-secondary">
        {localize('com_insights_media_cost_summary', {
          provider: money.format(data.summary.providerCostUSD),
          estimate: money.format(data.summary.estimatedCostUSD),
          operator: money.format(data.summary.operatorCostUSD),
          unclassified: money.format(data.summary.unclassifiedCostUSD),
          unknown: number.format(data.summary.unknownCostJobs),
        })}
      </p>
      {data.summary.submitted === 0 ? (
        <EmptyState message={localize('com_insights_no_data')} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">{localize('com_insights_media_title')}</caption>
              <thead className="border-b border-border-medium text-text-secondary">
                <tr>
                  {(
                    [
                      'com_insights_media_provider',
                      'com_insights_media_model',
                      'com_insights_media_operation',
                      'com_insights_media_submitted',
                      'com_insights_media_completed',
                      'com_insights_media_failed',
                      'com_insights_media_cancelled',
                      'com_insights_media_active',
                      'com_insights_media_uncertain',
                      'com_insights_media_provider_cost',
                      'com_insights_media_operator_cost',
                      'com_insights_media_estimated_cost',
                      'com_insights_media_legacy_cost',
                      'com_insights_media_unknown_cost',
                    ] as const
                  ).map((key) => (
                    <th scope="col" key={key} className="whitespace-nowrap px-2 py-2 font-medium">
                      {localize(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border-light">
                {data.offerings.map((row) => (
                  <tr key={JSON.stringify([row.provider, row.model, row.operation])}>
                    <td className="px-2 py-3">{row.provider}</td>
                    <td className="px-2 py-3">{row.model}</td>
                    <td className="whitespace-nowrap px-2 py-3">
                      {localize(operationLabel(row.operation))}
                    </td>
                    {[
                      row.submitted,
                      row.completed,
                      row.failed,
                      row.cancelled,
                      row.active,
                      row.uncertain,
                    ].map((value, index) => (
                      <td key={index} className="px-2 py-3 tabular-nums">
                        {number.format(value)}
                      </td>
                    ))}
                    <td className="px-2 py-3 tabular-nums">{money.format(row.providerCostUSD)}</td>
                    <td className="px-2 py-3 tabular-nums">{money.format(row.operatorCostUSD)}</td>
                    <td className="px-2 py-3 tabular-nums">{money.format(row.estimatedCostUSD)}</td>
                    <td className="px-2 py-3 tabular-nums">
                      {money.format(row.unclassifiedCostUSD)}
                    </td>
                    <td className="px-2 py-3 tabular-nums">{number.format(row.unknownCostJobs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-border-light pt-3 text-sm text-text-secondary">
            <span>{localize('com_insights_page_of', { page: data.page, pages: data.pages })}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching || data.page <= 1}
                onClick={() => onPage(data.page - 1)}
              >
                {localize('com_ui_prev')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={isFetching || data.page >= data.pages}
                onClick={() => onPage(data.page + 1)}
              >
                {localize('com_ui_next')}
              </Button>
            </div>
          </div>
        </>
      )}
    </Panel>
  );
}
