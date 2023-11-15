import { Root, Trigger } from '@radix-ui/react-popover';
import { useGetEndpointsQuery } from 'librechat-data-provider';
import NewEndpointMenu from './Menus/NewEndpointMenu';
import { mapEndpoints, alternateName } from '~/utils';
import HeaderOptions from './Input/HeaderOptions';
import { useChatContext } from '~/Providers';

export default function Header() {
  const { conversation } = useChatContext();
  const { data: endpoints = [] } = useGetEndpointsQuery({
    select: mapEndpoints,
  });

  const currentEndpoint = conversation?.endpoint ?? '';

  return (
    <div className="sticky top-0 z-10 flex h-14 w-full items-center justify-between bg-white/95 p-2 font-semibold dark:bg-gray-800/90 dark:text-white">
      <Root>
        <div className="flex items-center gap-2">
          <Trigger asChild>
            <div
              className="group flex cursor-pointer items-center gap-1 rounded-xl px-3 py-2 text-lg font-medium hover:bg-gray-50 radix-state-open:bg-gray-50 dark:hover:bg-black/10 dark:radix-state-open:bg-black/20"
              // type="button"
            >
              <div>
                {alternateName[currentEndpoint]}{' '}
                {/* <span className="text-token-text-secondary">Secondary Text</span> */}
              </div>
              <svg
                width="16"
                height="17"
                viewBox="0 0 16 17"
                fill="none"
                className="text-token-text-tertiary"
              >
                <path
                  d="M11.3346 7.83203L8.00131 11.1654L4.66797 7.83203"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </Trigger>
        </div>
        <NewEndpointMenu endpoints={endpoints} selected={conversation?.endpoint ?? ''} />
      </Root>
      <HeaderOptions />
      {/* Empty div for spacing */}
      <div />
    </div>
  );
}
