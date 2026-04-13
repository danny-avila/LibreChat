import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { useGetMagicLinksQuery } from '~/data-provider';
import CreateMagicLinkModal from './CreateMagicLinkModal';
import MagicLinkTable from './MagicLinkTable';

export default function MagicLinksView() {
  const localize = useLocalize();
  const [modalOpen, setModalOpen] = useState(false);
  const { data: links = [], isLoading, error } = useGetMagicLinksQuery();

  return (
    <div className="flex h-screen flex-col">
      <div className="flex items-center justify-between border-b border-border-light px-6 py-4">
        <h1 className="text-xl font-semibold text-text-primary">
          {localize('com_ui_magic_links')}
        </h1>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          {localize('com_ui_magic_link_generate')}
        </Button>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading && <p className="text-sm text-text-secondary">{localize('com_ui_loading')}</p>}
        {error && <p className="text-sm text-red-500">{localize('com_ui_magic_link_load_failed')}</p>}
        {!isLoading && !error && <MagicLinkTable links={links} />}
      </div>

      <CreateMagicLinkModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
