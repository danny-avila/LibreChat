import { useGetEndpointsQuery } from 'librechat-data-provider';
import NewEndpointMenu from './Menus/NewEndpointMenu';
import HeaderOptions from './Input/HeaderOptions';
import { useChatContext } from '~/Providers';
import { mapEndpoints } from '~/utils';

export default function Header() {
  const { conversation } = useChatContext();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white/95 p-2 font-semibold dark:bg-gray-800/90 dark:text-white">
      <div className="flex items-center gap-2 overflow-x-auto">
        <NewEndpointMenu endpoints={endpoints} selected={conversation?.endpoint ?? ''} />
        <HeaderOptions />
      </div>
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
