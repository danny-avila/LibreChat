import React, { useCallback, useMemo, useState } from 'react';
import copy from 'copy-to-clipboard';
import { Check, Copy } from 'lucide-react';
import { Constants } from 'librechat-data-provider';
import type { TStartupConfig } from 'librechat-data-provider';
import { useGetStartupConfig } from '~/data-provider';
import { useLocalize } from '~/hooks';

const UNKNOWN_PLACEHOLDER = '—';

function formatBuildDate(raw: string | null | undefined): string {
  if (!raw) {
    return UNKNOWN_PLACEHOLDER;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }
  return date
    .toISOString()
    .replace('T', ' ')
    .replace(/\.\d{3}Z$/, ' UTC');
}

function buildDiagnosticsBlob(
  version: string,
  buildInfo: TStartupConfig['buildInfo'] | undefined,
): string {
  const lines: string[] = [
    `LibreChat version: ${version}`,
    `Commit: ${buildInfo?.commit ?? UNKNOWN_PLACEHOLDER}`,
    `Branch: ${buildInfo?.branch ?? UNKNOWN_PLACEHOLDER}`,
    `Build date: ${formatBuildDate(buildInfo?.buildDate)}`,
    `User agent: ${typeof navigator !== 'undefined' ? navigator.userAgent : UNKNOWN_PLACEHOLDER}`,
  ];
  return lines.join('\n');
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <div className="text-text-secondary">{label}</div>
      <div className="break-all text-right font-mono text-xs text-text-primary">{value}</div>
    </div>
  );
}

function About() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const [copied, setCopied] = useState(false);

  const buildInfo = startupConfig?.buildInfo;
  const version: string = Constants.VERSION;

  const diagnosticsBlob = useMemo(
    () => buildDiagnosticsBlob(version, buildInfo),
    [version, buildInfo],
  );

  const onCopy = useCallback(() => {
    copy(diagnosticsBlob, { format: 'text/plain' });
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }, [diagnosticsBlob]);

  return (
    <div className="flex flex-col gap-3 p-1 text-sm text-text-primary">
      <section aria-labelledby="about-version-heading" className="flex flex-col">
        <h3 id="about-version-heading" className="mb-2 text-sm font-medium text-text-primary">
          {localize('com_nav_about_version_heading')}
        </h3>
        <div className="rounded-lg border border-border-light bg-surface-secondary p-3">
          <Row label={localize('com_nav_about_version')} value={version} />
          <Row
            label={localize('com_nav_about_commit')}
            value={buildInfo?.commitShort ?? UNKNOWN_PLACEHOLDER}
          />
          <Row
            label={localize('com_nav_about_branch')}
            value={buildInfo?.branch ?? UNKNOWN_PLACEHOLDER}
          />
          <Row
            label={localize('com_nav_about_build_date')}
            value={formatBuildDate(buildInfo?.buildDate)}
          />
        </div>
      </section>

      <section aria-labelledby="about-diagnostics-heading" className="flex flex-col">
        <h3 id="about-diagnostics-heading" className="mb-2 text-sm font-medium text-text-primary">
          {localize('com_nav_about_diagnostics_heading')}
        </h3>
        <p className="mb-2 text-xs text-text-secondary">
          {localize('com_nav_about_diagnostics_description')}
        </p>
        <button
          type="button"
          onClick={onCopy}
          className="inline-flex items-center justify-center gap-2 self-start rounded-md border border-border-light bg-surface-secondary px-3 py-1.5 text-xs font-medium text-text-primary transition-colors hover:bg-surface-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-xheavy"
          aria-live="polite"
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" aria-hidden="true" />
              {localize('com_nav_about_diagnostics_copied')}
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" aria-hidden="true" />
              {localize('com_nav_about_diagnostics_copy')}
            </>
          )}
        </button>
      </section>
    </div>
  );
}

export default React.memo(About);
