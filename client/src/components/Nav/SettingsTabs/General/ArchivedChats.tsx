import { useLocalize } from '~/hooks';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { Dialog, DialogTrigger } from '~/components/ui';

import ArchivedChatsTable from './ArchivedChatsTable';

export default function ArchivedChats() {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_archived_chats')}</div>
      <Dialog>
        <DialogTrigger asChild>
          <button className="btn btn-neutral relative ">
            {localize('com_nav_archived_chats_manage')}
          </button>
        </DialogTrigger>
        <DialogTemplate
          title={localize('com_nav_archived_chats')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ArchivedChatsTable />}
        />
      </Dialog>
    </div>
  );
}
