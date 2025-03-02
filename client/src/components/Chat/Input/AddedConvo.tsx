import { useMemo } from 'react';
import type { TConversation, TEndpointOption, TPreset } from 'librechat-data-provider';
import type { SetterOrUpdater } from 'recoil';
import useGetSender from '~/hooks/Conversations/useGetSender';
import { useGetEndpointsQuery } from '~/data-provider';
import { EndpointIcon } from '~/components/Endpoints';
import { getPresetTitle } from '~/utils';

export default function AddedConvo({
  addedConvo,
  setAddedConvo,
}: {
  addedConvo: TConversation | null;
  setAddedConvo: SetterOrUpdater<TConversation | null>;
}) {
  const getSender = useGetSender();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const title = useMemo(() => {
    const sender = getSender(addedConvo as TEndpointOption);
    const title = getPresetTitle(addedConvo as TPreset);
    return `+ ${sender}: ${title}`;
  }, [addedConvo, getSender]);

  if (!addedConvo) {
    return null;
  }
  return (
    <div className="flex items-start gap-4 py-2.5 pl-3 pr-1.5 text-sm">
      <span className="mt-0 flex h-6 w-6 flex-shrink-0 items-center justify-center">
        <div className="icon-md">
          <EndpointIcon
            conversation={addedConvo}
            endpointsConfig={endpointsConfig}
            containerClassName="shadow-stroke overflow-hidden rounded-full"
            context="menu-item"
            size={20}
          />
        </div>
      </span>
      <span className="text-token-text-secondary line-clamp-3 flex-1 py-0.5 font-semibold">
        {title}
      </span>
      <button
        className="text-token-text-secondary flex-shrink-0"
        type="button"
        aria-label="Close added conversation"
        onClick={() => setAddedConvo(null)}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          fill="none"
          viewBox="0 0 24 24"
          className="icon-lg"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            fillRule="evenodd"
            d="M7.293 7.293a1 1 0 0 1 1.414 0L12 10.586l3.293-3.293a1 1 0 1 1 1.414 1.414L13.414 12l3.293 3.293a1 1 0 0 1-1.414 1.414L12 13.414l-3.293 3.293a1 1 0 0 1-1.414-1.414L10.586 12 7.293 8.707a1 1 0 0 1 0-1.414"
            clipRule="evenodd"
          ></path>
        </svg>
      </button>
    </div>
  );
}
