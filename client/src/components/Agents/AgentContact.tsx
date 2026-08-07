import type { AgentOwnerContact, SupportContact } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export type ContactResource = {
  support_contact?: SupportContact;
  owner_contact?: AgentOwnerContact;
};

type AgentContactProps = {
  resource?: ContactResource | null;
  className?: string;
};

export default function AgentContact({ resource, className = '' }: AgentContactProps) {
  const localize = useLocalize();
  const supportName = resource?.support_contact?.name?.trim() ?? '';
  const supportEmail = resource?.support_contact?.email?.trim() ?? '';
  const ownerName = resource?.owner_contact?.name?.trim() ?? '';
  let contact: { name: string; email: string } | null = null;
  if (supportName || supportEmail) {
    contact = { name: supportName, email: supportEmail };
  } else if (ownerName) {
    contact = { name: ownerName, email: '' };
  }

  const label = contact?.name || contact?.email || localize('com_agents_no_contact_available');

  return (
    <div className={cn('flex min-w-0 items-center gap-1 text-text-secondary', className)}>
      <span className="shrink-0">{localize('com_agents_contact')}:</span>
      <span className="min-w-0 truncate">
        {contact?.email ? (
          <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
            {label}
          </a>
        ) : (
          label
        )}
      </span>
    </div>
  );
}
