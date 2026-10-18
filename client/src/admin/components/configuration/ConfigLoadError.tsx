import type * as t from '~/admin/types';
import { useLocalize } from '~/admin/hooks';
import { Button, Icon } from '~/admin/ui';

function errorMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message || null;
  if (typeof error === 'string') return error || null;
  return null;
}

/** Danger card with Retry, shown in place of the configuration form when its data fails to load. */
export function ConfigLoadError({
  error,
  onRetry,
  retrying,
  titleKey = 'com_admin_config_shell_load_error_title',
  descriptionKey = 'com_admin_config_shell_load_error_desc',
}: t.ConfigLoadErrorProps) {
  const localize = useLocalize();
  const details = errorMessage(error);

  return (
    <div className="py-6 pr-4">
      <div
        role="alert"
        className="flex flex-col gap-3 rounded-lg border border-(--cui-color-stroke-default) bg-(--cui-color-background-default) p-5"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="mt-0.5 shrink-0 text-(--cui-color-text-danger)">
            <Icon name="warning" size="sm" />
          </span>
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="m-0 text-sm font-semibold text-(--cui-color-text-default)">
              {localize(titleKey)}
            </h2>
            <p className="m-0 text-sm text-(--cui-color-text-muted)">{localize(descriptionKey)}</p>
            {details && (
              <details className="text-xs text-(--cui-color-text-muted)">
                <summary className="cursor-pointer select-none">
                  {localize('com_admin_config_shell_load_error_details')}
                </summary>
                <code className="mt-1 block font-mono break-all whitespace-pre-wrap">
                  {details}
                </code>
              </details>
            )}
          </div>
        </div>
        <div>
          <Button
            htmlType="button"
            type="secondary"
            label={localize('com_admin_config_shell_retry')}
            iconLeft={retrying ? 'loading-animated' : 'refresh'}
            disabled={retrying}
            onClick={onRetry}
          />
        </div>
      </div>
    </div>
  );
}
