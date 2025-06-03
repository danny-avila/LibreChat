import { useState } from 'react';
import { OGDialog, OGDialogTrigger, Button } from '~/components';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import ArchivedChatsTable from './ArchivedChatsTable';
import { useLocalize } from '~/hooks';

export default function ArchivedChats() {
  const localize = useLocalize();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_archived_chats')}</div>
      <OGDialog open={isOpen} onOpenChange={setIsOpen}>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label="Archived chats">
            {localize('com_ui_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          title={localize('com_nav_archived_chats')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ArchivedChatsTable isOpen={isOpen} onOpenChange={setIsOpen} />}
        />
      </OGDialog>
    </div>
  );
}
