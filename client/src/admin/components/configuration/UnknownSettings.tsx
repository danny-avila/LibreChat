import yaml from 'js-yaml';
import type * as t from '~/admin/types';
import { getUnknownConfigEntries, maskSecretValues } from '~/admin/utils';
import { useLocalize } from '~/admin/hooks';

function formatUnknownValue(value: t.ConfigValue): string {
  if (value === null) return 'null';
  if (typeof value !== 'object') return String(value);
  return yaml.dump(value, { lineWidth: -1 }).trimEnd();
}

/**
 * Read-only list of settings present in the configuration but unknown to the
 * panel's schema. They are shown so admins know they exist, and left untouched
 * on save (saves only write the fields an admin edits).
 */
export function UnknownSettings({ fields, value, path }: t.UnknownSettingsProps) {
  const localize = useLocalize();
  const entries = getUnknownConfigEntries(fields, value);
  if (entries.length === 0) return null;
  const headingId = `unknown-settings-${path.replace(/\./g, '-')}`;
  return (
    <section
      aria-labelledby={headingId}
      className="mt-4 flex flex-col gap-2 rounded-lg border border-dashed border-(--cui-color-stroke-default) px-3 py-2"
    >
      <div>
        <h4 id={headingId} className="m-0 text-sm font-medium text-(--cui-color-text-default)">
          {localize('com_admin_config_unknown_settings')}
        </h4>
        <p className="m-0 text-xs text-(--cui-color-text-muted)">
          {localize('com_admin_config_unknown_settings_desc')}
        </p>
      </div>
      <dl className="m-0 flex flex-col gap-1.5">
        {entries.map(([key, entryValue]) => {
          const formatted = formatUnknownValue(maskSecretValues(entryValue, key));
          return (
            <div key={key} className="flex flex-col gap-0.5 sm:flex-row sm:gap-4">
              <dt className="shrink-0 font-mono text-xs break-all text-(--cui-color-text-default) sm:w-64">
                {key}
              </dt>
              <dd className="m-0 min-w-0 flex-1 overflow-x-auto">
                <code className="block font-mono text-xs whitespace-pre text-(--cui-color-text-muted)">
                  {formatted}
                </code>
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
