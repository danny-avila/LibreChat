/* eslint-disable indent */
import { useParams } from 'react-router-dom';
import { useState, useRef, useMemo } from 'react';
import type { MouseEvent, FocusEvent, KeyboardEvent } from 'react';
import { useNavigateToConvo } from '~/hooks';
import { NotificationSeverity } from '~/common';
import { useToastContext } from '~/Providers';
import DeleteButton from '../Conversations/DeleteButton';
import RenameButton from '../Conversations/RenameButton';
import { EModelEndpoint, TUser, request } from 'librechat-data-provider';
import { useRecoilState, useRecoilValue } from 'recoil';
import store from '~/store';
import LeaveButton from '../Conversations/LeaveButton';
import { isRoomOwner, isYou } from '~/utils/checkUserValid';
import Marquee from 'react-fast-marquee';

type KeyEvent = KeyboardEvent<HTMLInputElement>;

export default function Room({ room, toggleNav, retainView }) {
  const params = useParams();
  const currentRoomId = useMemo(() => params.conversationId, [params.conversationId]);
  const { showToast } = useToastContext();
  const { navigateToConvo } = useNavigateToConvo('r');
  const [rooms, setRooms] = useRecoilState(store.rooms);
  const user = useRecoilValue(store.user);

  const { conversationId, title } = room;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleInput, setTitleInput] = useState(title);
  const [renaming, setRenaming] = useState(false);

  const clickHandler = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button === 0 && event.ctrlKey) {
      toggleNav();
      return;
    }

    event.preventDefault();
    if (currentRoomId === conversationId) {
      return;
    }

    toggleNav();

    // set document title
    document.title = title;

    // set conversation to the new conversation
    if (room?.endpoint === EModelEndpoint.gptPlugins) {
      let lastSelectedTools = [];
      try {
        lastSelectedTools = JSON.parse(localStorage.getItem('lastSelectedTools') ?? '') ?? [];
      } catch (e) {
        // console.error(e);
      }
      navigateToConvo({ ...room, tools: lastSelectedTools });
    } else {
      navigateToConvo(room);
    }
  };

  const renameHandler = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setTitleInput(title);
    setRenaming(true);
    setTimeout(() => {
      if (!inputRef.current) {
        return;
      }
      inputRef.current.focus();
    }, 25);
  };

  const onRename = (e: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLInputElement> | KeyEvent) => {
    e.preventDefault();
    setRenaming(false);
    if (titleInput === title) {
      return;
    }

    request
      .post('/api/convos/update', {
        arg: {
          conversationId,
          title: titleInput,
        },
      })
      .then(() => {
        setRooms((prevRooms) =>
          prevRooms.map((r) => {
            if (r.conversationId === conversationId) {
              return { ...r, title: titleInput };
            } else {
              return r;
            }
          }),
        );
      })
      .catch(() => {
        setTitleInput(title);
        showToast({
          message: 'Failed to rename conversation',
          severity: NotificationSeverity.ERROR,
          showIcon: true,
        });
      });
  };

  // const icon = MinimalIcon({
  //   size: 20,
  //   iconURL: getEndpointField(endpointsConfig, conversation.endpoint, 'iconURL'),
  //   endpoint: conversation.endpoint,
  //   endpointType: conversation.endpointType,
  //   model: conversation.model,
  //   error: false,
  //   className: 'mr-0',
  //   isCreatedByUser: false,
  //   chatGptLabel: undefined,
  //   modelLabel: undefined,
  //   jailbreak: undefined,
  // });

  const handleKeyDown = (e: KeyEvent) => {
    if (e.key === 'Enter') {
      onRename(e);
    }
  };
  const aProps = {
    className:
      'group relative rounded-lg active:opacity-50 flex cursor-pointer items-center mt-2 gap-2 break-all rounded-lg bg-gray-200 dark:bg-gray-700 py-2 px-2',
  };

  if (currentRoomId === conversationId) {
    aProps.className =
      'group relative grow overflow-hidden whitespace-nowrap rounded-lg active:opacity-50 flex cursor-pointer items-center mt-2 gap-2 break-all rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 py-2 px-2';
  }
  if(room.isPrivate) {return <></>;}
  return (
    <a
      href={`/r/${conversationId}`}
      data-testid="convo-item"
      onClick={clickHandler}
      {...aProps}
      title={`${title} - ${room.users ? room.users.length + 1 : 1} Participants`}
    >
      {/* {icon} */}
      <div className="relative line-clamp-1 max-h-5 flex-1 grow overflow-hidden">
        {renaming === true ? (
          <input
            ref={inputRef}
            type="text"
            className="m-0 mr-0 w-full border border-blue-500 bg-transparent p-0 text-sm leading-tight outline-none"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onBlur={onRename}
            onKeyDown={handleKeyDown}
          />
        ) : (title.length > 8 &&
            currentRoomId === conversationId &&
            isRoomOwner(user as TUser, room)) ||
          title.length > 15 ? (
          <Marquee
            speed={30}
            style={
              currentRoomId === conversationId && isRoomOwner(user as TUser, room)
                ? { width: '70%' }
                : currentRoomId === conversationId && isYou(user as TUser, room)
                ? { width: '90%' }
                : { width: '100%' }
            }
          >
            {title} &#160;-&#160;{room.users ? room.users.length + 1 : 1}&#160; Participants
            &#160;&#160;&#160;
          </Marquee>
        ) : (
          <>
            {title} &#160;-&#160;{room.users ? room.users.length + 1 : 1}&#160; Participants
            &#160;&#160;&#160;
          </>
        )}
      </div>
      {currentRoomId === conversationId ? (
        <div
          className={`absolute bottom-0 right-0 top-0 w-20 rounded-r-lg bg-gradient-to-l ${
            !renaming ? 'from-gray-200 from-60% to-transparent dark:from-gray-700' : ''
          }`}
        ></div>
      ) : (
        <div className="absolute bottom-0 right-0 top-0 w-2 bg-gradient-to-l from-0% to-transparent group-hover:w-1 group-hover:from-60%"></div>
      )}
      {currentRoomId === conversationId ? (
        <div
          className="visible absolute right-1 z-10 flex from-gray-900 text-gray-500 dark:text-gray-300"
          style={{ backgroundColor: 'hsla(0, 0%, 100%, 0.1)' }}
        >
          {isRoomOwner(user as TUser, room) && (
            <>
              <RenameButton renaming={renaming} onRename={onRename} renameHandler={renameHandler} />
              <DeleteButton
                conversationId={conversationId}
                retainView={retainView}
                renaming={renaming}
                title={title}
              />
            </>
          )}
          {isYou(user as TUser, room) && (
            <LeaveButton conversationId={conversationId} title={title} />
          )}
        </div>
      ) : (
        <div className="absolute bottom-0 right-0 top-0 w-14 rounded-lg bg-gradient-to-l from-gray-50 from-0% to-transparent group-hover:from-gray-200 dark:from-gray-750 dark:group-hover:from-gray-800" />
      )}
    </a>
  );
}
