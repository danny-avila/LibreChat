import { useRecoilValue } from 'recoil';
import { useState, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { MouseEvent, KeyboardEvent } from 'react';
import DeleteButton from './NewDeleteButton';
import RenameButton from './RenameButton';
import store from '~/store';
import VeraWhiteLogo from '../svg/VeraWhiteLogo';
import { useVeraChat } from '~/hooks';
import { RedactReplace, formatRedactedString } from '../Chat/Messages/Content/RedactReplace';

type KeyEvent = KeyboardEvent<HTMLInputElement>;

export default function Conversation({ conversation, retainView, toggleNav, isLatestConvo }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { conversationId: currentConvoId } = useParams();
  const { conversation_id: conversationId, description: title } = conversation;

  const inputRef = useRef<HTMLInputElement | null>(null);
  const [titleInput, setTitleInput] = useState(title);
  const [renaming, setRenaming] = useState(false);

  const clickHandler = async (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (event.button === 0 && event.ctrlKey) {
      toggleNav();
      return;
    }

    event.preventDefault();
    if (currentConvoId === conversationId) {
      return;
    }

    toggleNav();

    // set document title
    // document.title = title;

    // set conversation to the new conversation
    navigate(`/c/${conversationId}`, { replace: true });
    console.log('[CONVO] conversation: ', conversation);
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

  const aProps = {
    className:
      'group relative rounded-lg active:opacity-50 flex cursor-pointer items-center mt-2 gap-3 break-all rounded-lg bg-gray-800 py-2 px-2',
  };

  const activeConvo =
    currentConvoId === conversationId || conversationId === location.pathname.substring(3);
  //|| (isLatestConvo && currentConvoId === 'new' && activeConvos[0] && activeConvos[0] !== 'new');

  if (!activeConvo) {
    aProps.className =
      'group relative rounded-lg active:opacity-50 flex cursor-pointer items-center mt-2 gap-3 break-all rounded-lg py-2 px-2 hover:bg-gray-900';
  }

  return (
    <a
      href={`/c/${conversationId}`}
      data-testid="convo-item"
      onClick={clickHandler}
      {...aProps}
      title={title}
    >
      <div style={{ width: 18, height: 18 }}>
        <VeraWhiteLogo />
      </div>
      <div className="relative line-clamp-1 max-h-5 flex-1 grow overflow-hidden">
        {renaming === true ? (
          <input
            ref={inputRef}
            type="text"
            className="m-0 mr-0 w-full border border-blue-500 bg-transparent p-0 text-sm leading-tight outline-none"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
          />
        ) : (
          title.replaceAll('&lt;REDACTED&gt;', 'Redacted Conversation')
        )}
      </div>
      {activeConvo ? (
        <div className="absolute bottom-0 right-1 top-0 w-20 bg-gradient-to-l from-gray-800 from-60% to-transparent"></div>
      ) : (
        <div className="from--gray-900 absolute bottom-0 right-0 top-0 w-2 bg-gradient-to-l from-0% to-transparent group-hover:w-1 group-hover:from-60%"></div>
      )}
      {activeConvo ? (
        <>
          {/* <div className="visible absolute right-1 z-10 flex text-gray-400">
        <RenameButton renaming={renaming} onRename={onRename} renameHandler={renameHandler} />
        <DeleteButton
          conversationId={conversationId}
          retainView={retainView}
          renaming={renaming}
          title={title}
        />
      </div> */}
        </>
      ) : (
        <div className="absolute bottom-0 right-0 top-0 w-20 rounded-lg bg-gradient-to-l from-black from-0% to-transparent  group-hover:from-gray-900" />
      )}
    </a>
  );
}
