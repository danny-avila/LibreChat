import { useLocalize } from '~/hooks';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { OGDialog, OGDialogTrigger, Button } from '~/components';

import ArchivedChatsTable from './ArchivedChatsTable';

export default function ArchivedChats() {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_archived_chats')}</div>
      <OGDialog>
        <OGDialogTrigger asChild>
          <Button variant="outline" aria-label="Archived chats">
            {localize('com_nav_archived_chats_manage')}
          </Button>
        </OGDialogTrigger>
        <OGDialogTemplate
          title={localize('com_nav_archived_chats')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ArchivedChatsTable />}
        />
      </OGDialog>
    </div>
  );
}
