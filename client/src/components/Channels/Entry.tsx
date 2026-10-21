import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Label } from '@librechat/client';
import { dataService, QueryKeys } from 'librechat-data-provider';
import { useLocalize } from '~/hooks';

export default function ChannelEntry() {
  const localize = useLocalize();
  const availability = useQuery(
    [QueryKeys.channelAvailability],
    dataService.getChannelAvailability,
    { retry: false, staleTime: 60000 },
  );
  if (!availability.data?.enabled) return null;
  return (
    <div className="flex items-center justify-between">
      <Label>{localize('com_channels_title')}</Label>
      <Button asChild variant="outline">
        <Link to="/channels">{localize('com_ui_manage')}</Link>
      </Button>
    </div>
  );
}
