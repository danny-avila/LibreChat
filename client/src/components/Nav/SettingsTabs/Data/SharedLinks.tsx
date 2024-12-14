import { useLocalize } from '~/hooks';
import { OGDialog, OGDialogTrigger } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';

import ShareLinkTable from './SharedLinkTable';

export default function SharedLinks() {
  const localize = useLocalize();

  return (
    <div className="flex items-center justify-between">
      <div>{localize('com_nav_shared_links')}</div>

      <OGDialog>
        <OGDialogTrigger asChild>
          <button className="btn btn-neutral relative ">
            {localize('com_nav_shared_links_manage')}
          </button>
        </OGDialogTrigger>
        <OGDialogTemplate
          title={localize('com_nav_shared_links')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ShareLinkTable className="w-full" />}
        />
      </OGDialog>
    </div>
  );
}
