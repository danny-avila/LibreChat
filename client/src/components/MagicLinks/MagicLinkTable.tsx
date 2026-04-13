import { useState } from 'react';
import { Link2Off } from 'lucide-react';
import { Button } from '@librechat/client';
import type { TMagicLink } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';
import { useRevokeMagicLinkMutation } from '~/data-provider';

interface MagicLinkTableProps {
  links: TMagicLink[];
}

export default function MagicLinkTable({ links }: MagicLinkTableProps) {
  const localize = useLocalize();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { mutate: revoke, isLoading } = useRevokeMagicLinkMutation({
    onSuccess: () => setConfirmId(null),
  });

  if (links.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-text-secondary">
        {localize('com_ui_magic_link_no_links')}
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border-light text-left text-text-secondary">
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_email')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_active')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_uses')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_last_used')}</th>
            <th className="pb-2 pr-4 font-medium">{localize('com_ui_magic_link_created')}</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody>
          {links.map((link) => (
            <tr key={link.id} className="border-b border-border-light">
              <td className="py-3 pr-4 font-mono text-xs">{link.email}</td>
              <td className="py-3 pr-4">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    link.active
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                >
                  {link.active
                    ? localize('com_ui_magic_link_active')
                    : localize('com_ui_magic_link_revoked')}
                </span>
              </td>
              <td className="py-3 pr-4">{link.useCount}</td>
              <td className="py-3 pr-4 text-text-secondary">
                {link.lastUsedAt ? new Date(link.lastUsedAt).toLocaleDateString() : '—'}
              </td>
              <td className="py-3 pr-4 text-text-secondary">
                {new Date(link.createdAt).toLocaleDateString()}
              </td>
              <td className="py-3">
                {link.active && (
                  <>
                    {confirmId === link.id ? (
                      <div className="flex gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          disabled={isLoading}
                          onClick={() => revoke(link.id)}
                        >
                          {localize('com_ui_confirm')}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmId(null)}>
                          {localize('com_ui_cancel')}
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmId(link.id)}
                        aria-label={localize('com_ui_magic_link_revoke')}
                      >
                        <Link2Off className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
