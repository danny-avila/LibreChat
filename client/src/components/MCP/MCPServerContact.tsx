import type { MCPServerOwnerContact, SupportContact } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

type MCPServerContactProps = {
  server?: {
    support_contact?: SupportContact;
    owner_contact?: MCPServerOwnerContact;
  } | null;
  className?: string;
};

export default function MCPServerContact({ server, className = '' }: MCPServerContactProps) {
  const localize = useLocalize();
  const supportName = server?.support_contact?.name?.trim();
  const supportEmail = server?.support_contact?.email?.trim();
  const ownerName = server?.owner_contact?.name?.trim();
  const name = supportName || supportEmail || ownerName;

  return (
    <div className={cn('flex min-w-0 items-center gap-1 text-text-secondary', className)}>
      <span className="shrink-0">{localize('com_ui_contact')}:</span>
      <span className="min-w-0 truncate">
        {supportEmail ? (
          <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
            {name}
          </a>
        ) : (
          name || localize('com_ui_no_contact_available')
        )}
      </span>
    </div>
  );
}
