import type { TConversation } from 'librechat-data-provider';
import { Constants } from 'librechat-data-provider';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { NotificationSeverity } from '~/common';
import EndpointIcon from '~/components/Endpoints/EndpointIcon';
import { useGetEndpointsQuery, useUpdateConversationMutation } from '~/data-provider';
import { useMediaQuery } from '~/hooks';
import useNavigateToConvo from '~/hooks/Conversations/useNavigateToConvo';
import useLocalize from '~/hooks/useLocalize';
import { useToastContext } from '~/Providers';
import store from '~/store';
import { cn } from '~/utils';
import ConvoLink from './ConvoLink';
import { ConvoOptions } from './ConvoOptions';
import RenameForm from './RenameForm';

interface ConversationProps {
  conversation: TConversation;
  retainView: () => void;
  toggleNav: () => void;
  isLatestConvo: boolean;
}

export default function Conversation({
  conversation,
  retainView,
  toggleNav,
  isLatestConvo,
}: ConversationProps) {
  const params = useParams();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const currentConvoId = useMemo(() => params.conversationId, [params.conversationId]);
  const updateConvoMutation = useUpdateConversationMutation(currentConvoId ?? '');
  const activeConvos = useRecoilValue(store.allConversationsSelector);
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { navigateWithLastTools } = useNavigateToConvo();
  const isSmallScreen = useMediaQuery('(max-width: 768px)');
  const { conversationId, title = '' } = conversation;

  const [titleInput, setTitleInput] = useState(title || '');
  const [renaming, setRenaming] = useState(false);
  const [isPopoverActive, setIsPopoverActive] = useState(false);

  const previousTitle = useRef(title);

  useEffect(() => {
    if (title !== previousTitle.current) {
      setTitleInput(title as string);
      previousTitle.current = title;
    }
  }, [title]);

  const isActiveConvo = useMemo(() => {
    if (conversationId === Constants.NEW_CONVO) {
      return currentConvoId === Constants.NEW_CONVO;
    }

    if (currentConvoId !== Constants.NEW_CONVO) {
      return currentConvoId === conversationId;
    } else {
      const latestConvo = activeConvos?.[0];
      return latestConvo === conversationId;
    }
  }, [currentConvoId, conversationId, activeConvos]);

  const handleRename = () => {
    setIsPopoverActive(false);
    setTitleInput(title as string);
    setRenaming(true);
  };

  const handleRenameSubmit = async (newTitle: string) => {
    if (!conversationId || newTitle === title) {
      setRenaming(false);
      return;
    }

    try {
      await updateConvoMutation.mutateAsync({
        conversationId,
        title: newTitle.trim() || localize('com_ui_untitled'),
      });
      setRenaming(false);
    } catch (error) {
      setTitleInput(title as string);
      showToast({
        message: localize('com_ui_rename_failed'),
        severity: NotificationSeverity.ERROR,
        showIcon: true,
      });
      setRenaming(false);
    }
  };

  const handleCancelRename = () => {
    setTitleInput(title as string);
    setRenaming(false);
  };

  const handleNavigation = (ctrlOrMetaKey: boolean) => {
    if (ctrlOrMetaKey) {
      toggleNav();
      return;
    }

    if (currentConvoId === conversationId || isPopoverActive) {
      return;
    }

    toggleNav();

    if (typeof title === 'string' && title.length > 0) {
      document.title = title;
    }

    navigateWithLastTools(
      conversation,
      !(conversationId ?? '') || conversationId === Constants.NEW_CONVO,
    );
  };

  const convoOptionsProps = {
    title,
    retainView,
    renameHandler: handleRename,
    isActiveConvo,
    conversationId,
    isPopoverActive,
    setIsPopoverActive,
  };

  return (
    <div
      className={cn(
        'bg-beigesecondary hover:bg-beigetertiary group relative mt-1 flex h-7 w-full items-center rounded-lg dark:bg-darkbeige hover:dark:bg-darkbeige800',
        isActiveConvo ? 'bg-beigetertiary dark:bg-darkbeige800' : '',
      )}
      role="listitem"
      tabIndex={0}
      onClick={(e) => {
        if (renaming) {
          return;
        }
        if (e.button === 0) {
          handleNavigation(e.ctrlKey || e.metaKey);
        }
      }}
      onKeyDown={(e) => {
        if (renaming) {
          return;
        }
        if (e.key === 'Enter') {
          handleNavigation(false);
        }
      }}
      style={{ cursor: renaming ? 'default' : 'pointer' }}
      data-testid="convo-item"
    >
      {renaming ? (
        // <<<<<<< HEAD
        <RenameForm
          titleInput={titleInput}
          setTitleInput={setTitleInput}
          onSubmit={handleRenameSubmit}
          onCancel={handleCancelRename}
          localize={localize}
        />
      ) : (
        <ConvoLink
          isActiveConvo={isActiveConvo}
          title={title}
          onRename={handleRename}
          isSmallScreen={isSmallScreen}
          localize={localize}
        >
          <EndpointIcon
            conversation={conversation}
            endpointsConfig={endpointsConfig}
            size={20}
            context="menu-item"
          />
        </ConvoLink>
        // =======
        //         <div className="absolute inset-0 z-20 flex w-full items-center rounded-lg bg-beigetertiary dark:bg-claudeblack p-1.5">
        //           <input
        //             ref={inputRef}
        //             type="text"
        //             className="w-full rounded bg-transparent p-0.5 text-sm leading-tight focus-visible:outline-none"
        //             value={titleInput ?? ''}
        //             onChange={(e) => setTitleInput(e.target.value)}
        //             onKeyDown={handleKeyDown}
        //             aria-label={`${localize('com_ui_rename')} ${localize('com_ui_chat')}`}
        //           />
        //           <div className="flex gap-1">
        //             <button
        //               onClick={cancelRename}
        //               aria-label={`${localize('com_ui_cancel')} ${localize('com_ui_rename')}`}
        //             >
        //               <X
        //                 aria-hidden={true}
        //                 className="h-4 w-4 transition-colors duration-200 ease-in-out hover:opacity-70"
        //               />
        //             </button>
        //             <button
        //               onClick={onRename}
        //               aria-label={`${localize('com_ui_submit')} ${localize('com_ui_rename')}`}
        //             >
        //               <Check
        //                 aria-hidden={true}
        //                 className="h-4 w-4 transition-colors duration-200 ease-in-out hover:opacity-70"
        //               />
        //             </button>
        //           </div>
        //         </div>
        //       ) : (
        //         <a
        //           href={`/c/${conversationId}`}
        //           data-testid="convo-item"
        //           onClick={clickHandler}
        //           className={cn(
        //             'flex grow cursor-pointer items-center gap-2 overflow-hidden whitespace-nowrap break-all rounded-lg px-2 py-1',
        //             isActiveConvo ? 'bg-beigetertiary dark:bg-darkbeige800 hover:dark:bg-darkbeige800' : '',
        //           )}
        //           title={title ?? ''}
        //         >
        //           <div
        //             className="relative line-clamp-1 flex-1 grow overflow-hidden"
        //             onDoubleClick={(e) => {
        //               e.preventDefault();
        //               e.stopPropagation();
        //               setTitleInput(title);
        //               setRenaming(true);
        //             }}
        //           >
        //             {title}
        //           </div>
        //           {isActiveConvo ? (
        //             <div className="absolute bottom-0 right-0 top-0 w-20 rounded-r-lg " />
        //           ) : (
        //             <div className="absolute bottom-0 right-0 top-0 w-20 rounded-r-lg" />
        //           )}
        //         </a>
        // >>>>>>> d82f2f8f (Asdf)
      )}
      <div
        className={cn(
          'mr-2',
          isPopoverActive || isActiveConvo
            ? 'flex'
            : 'hidden group-focus-within:flex group-hover:flex',
        )}
      >
        {!renaming && <ConvoOptions {...convoOptionsProps} />}
      </div>
    </div>
  );
}
