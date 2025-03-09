import { Search } from 'lucide-react';
import { useRecoilValue } from 'recoil';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { QueryKeys, Constants } from 'librechat-data-provider';
import type { TConversation, TMessage } from 'librechat-data-provider';
import { getEndpointField, getIconEndpoint, getIconKey } from '~/utils';
import { icons } from '~/components/Chat/Menus/Endpoints/Icons';
import ConvoIconURL from '~/components/Endpoints/ConvoIconURL';
import { useGetEndpointsQuery } from '~/data-provider';
import { useLocalize, useNewConvo } from '~/hooks';
import { NewChatIcon } from '~/components/svg';
import { cn } from '~/utils';
import store from '~/store';

const NewChatButtonIcon = ({ conversation }: { conversation: TConversation | null }) => {
  const searchQuery = useRecoilValue(store.searchQuery);
  const { data: endpointsConfig } = useGetEndpointsQuery();

  if (searchQuery) {
    return (
      <div className="shadow-stroke relative flex h-7 w-7 items-center justify-center rounded-full bg-white text-black dark:bg-white">
        <Search className="h-5 w-5" />
      </div>
    );
  }

  let { endpoint = '' } = conversation ?? {};
  const iconURL = conversation?.iconURL ?? '';
  endpoint = getIconEndpoint({ endpointsConfig, iconURL, endpoint });

  const endpointType = getEndpointField(endpointsConfig, endpoint, 'type');
  const endpointIconURL = getEndpointField(endpointsConfig, endpoint, 'iconURL');
  const iconKey = getIconKey({ endpoint, endpointsConfig, endpointType, endpointIconURL });
  const Icon = icons[iconKey];

  return (
    <div className="h-7 w-7 flex-shrink-0">
      {iconURL && iconURL.includes('http') ? (
        <ConvoIconURL
          iconURL={iconURL}
          modelLabel={conversation?.chatGptLabel ?? conversation?.modelLabel ?? ''}
          endpointIconURL={iconURL}
          context="nav"
        />
      ) : (
        <div className="shadow-stroke relative flex h-full items-center justify-center rounded-full bg-white text-black">
          {endpoint && Icon != null && (
            <Icon
              size={41}
              context="nav"
              className="h-2/3 w-2/3"
              endpoint={endpoint}
              endpointType={endpointType}
              iconURL={endpointIconURL}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default function NewChat({
  index = 0,
  toggleNav,
  subHeaders,
  isSmallScreen,
}: {
  index?: number;
  toggleNav: () => void;
  subHeaders?: React.ReactNode;
  isSmallScreen: boolean;
}) {
  const queryClient = useQueryClient();
  /** Note: this component needs an explicit index passed if using more than one */
  const { newConversation: newConvo } = useNewConvo(index);
  const navigate = useNavigate();
  const localize = useLocalize();

  const { conversation } = store.useCreateConversationAtom(index);

  const clickHandler = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button === 0 && !(event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      queryClient.setQueryData<TMessage[]>(
        [QueryKeys.messages, conversation?.conversationId ?? Constants.NEW_CONVO],
        [],
      );
      newConvo();
      navigate('/c/new');
      toggleNav();
    }
  };

  return (
    <div className="sticky left-0 right-0 top-0 z-50 bg-surface-primary-alt pt-3.5">
      <div className="mt-6 h-8 w-full">
        <img
          src="/assets/logo.svg"
          className="h-full w-full object-contain"
          alt={localize('com_ui_logo', { 0: startupConfig?.appTitle ?? 'LibreChat' })}
        />
      </div>
      <div className="pb-0.5 last:pb-0" style={{ transform: 'none' }}>
        <a
          href="/"
          tabIndex={0}
          data-testid="nav-new-chat-button"
          onClick={clickHandler}
          className={cn(
            'group flex h-10 items-center gap-2 rounded-lg px-2 font-medium transition-colors duration-200 hover:bg-surface-hover',
            isSmallScreen ? 'h-14' : '',
          )}
          aria-label={localize('com_ui_new_chat')}
        >
          <NewChatButtonIcon conversation={conversation} />
          <div className="grow overflow-hidden text-ellipsis whitespace-nowrap text-sm text-text-primary">
            {localize('com_ui_new_chat')}
          </div>
          <div className="flex gap-3">
            <span className="flex items-center" data-state="closed">
              <NewChatIcon className="size-5" />
            </span>
          </div>
        </a>
      </div>
      {subHeaders != null ? subHeaders : null}
    </div>
  );
}
