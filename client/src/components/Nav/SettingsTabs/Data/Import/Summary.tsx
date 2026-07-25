import { Button, Spinner } from '@librechat/client';
import type { TImportSummary } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { formatBytes } from '~/utils';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

function formatAssetSize(bytes: number): string {
  if (bytes <= 0) {
    return `0 ${BYTE_UNITS[0]}`;
  }
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), BYTE_UNITS.length - 1);
  return `${formatBytes(bytes)} ${BYTE_UNITS[exponent]}`;
}

interface SummaryProps {
  summary: TImportSummary;
  onConfirm: () => void;
  onCancel: () => void;
  isConfirming: boolean;
  isCancelling: boolean;
}

export default function Summary({
  summary,
  onConfirm,
  onCancel,
  isConfirming,
  isCancelling,
}: SummaryProps) {
  const localize = useLocalize();
  const isBusy = isConfirming || isCancelling;

  return (
    <section aria-labelledby="import-summary-heading" className="flex flex-col gap-4">
      <h3 id="import-summary-heading" className="text-sm font-medium text-text-primary">
        {localize('com_ui_import_detected', { 0: summary.source })}
      </h3>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm text-text-secondary">
        <div>
          <dt className="sr-only">{localize('com_ui_import_stat_conversations')}</dt>
          <dd>{localize('com_ui_import_stat_conversations', { 0: summary.conversations })}</dd>
        </div>
        <div>
          <dt className="sr-only">{localize('com_ui_import_assets')}</dt>
          <dd>
            {localize('com_ui_import_assets', {
              0: summary.assets,
              1: formatAssetSize(summary.assetBytes),
            })}
          </dd>
        </div>
        <div>
          <dt className="sr-only">{localize('com_ui_import_stat_archived')}</dt>
          <dd>{localize('com_ui_import_stat_archived', { 0: summary.archived })}</dd>
        </div>
        <div>
          <dt className="sr-only">{localize('com_ui_import_stat_starred')}</dt>
          <dd>{localize('com_ui_import_stat_starred', { 0: summary.starred })}</dd>
        </div>
      </dl>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isBusy}>
          {isCancelling ? <Spinner className="size-4" /> : localize('com_ui_import_cancel')}
        </Button>
        <Button onClick={onConfirm} disabled={isBusy}>
          {isConfirming ? <Spinner className="size-4" /> : localize('com_ui_import')}
        </Button>
      </div>
    </section>
  );
}
