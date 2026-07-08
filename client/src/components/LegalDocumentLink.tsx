import { ExternalLink } from 'lucide-react';
import { useLocalize } from '~/hooks';

export interface LegalDocumentLinkConfig {
  externalUrl?: string;
  openNewTab?: boolean;
}

interface LegalDocumentLinkProps {
  config: LegalDocumentLinkConfig | null | undefined;
  labelKey: string;
  className?: string;
}

export function LegalDocumentLink({ config, labelKey, className }: LegalDocumentLinkProps) {
  const localize = useLocalize();

  if (!config?.externalUrl) {
    return null;
  }

  const label = localize(labelKey);
  const opensNewTab = config.openNewTab === true;

  return (
    <a
      className={className}
      href={config.externalUrl}
      target={opensNewTab ? '_blank' : undefined}
      rel="noopener noreferrer"
      aria-label={opensNewTab ? localize('com_ui_link_opens_new_tab', { label }) : label}
    >
      {label}
      {opensNewTab ? (
        <ExternalLink className="ml-1 inline-block h-3 w-3" aria-hidden="true" />
      ) : null}
    </a>
  );
}
