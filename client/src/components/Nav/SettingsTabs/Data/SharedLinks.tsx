import { useLocalize } from '~/hooks';
import { Dialog, DialogTrigger } from '~/components/ui';
import DialogTemplate from '~/components/ui/DialogTemplate';

import ShareLinkTable from './SharedLinkTable';

export default function SharedLinks() {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_shared_links')}</div>

      <Dialog>
        <DialogTrigger asChild>
          <button className="btn btn-neutral relative ">
            {localize('com_nav_shared_links_manage')}
          </button>
        </DialogTrigger>
        <DialogTemplate
          title={localize('com_nav_shared_links')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ShareLinkTable />}
        />
      </Dialog>
    </div>
  );
}
