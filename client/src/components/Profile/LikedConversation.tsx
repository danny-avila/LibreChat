import { TConversation, useGetLikedConversationQuery } from '@librechat/data-provider';
import { useEffect, useState } from 'react';
import { Spinner } from '../svg';
import { useNavigate, useParams } from 'react-router-dom';
import ConvoIcon from '../svg/ConvoIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';
import { localize } from '~/localization/Translation';
import { useRecoilValue } from 'recoil';

function LikedConversations() {
  const { user } = useAuthContext();
  const { userId = '' } = useParams();
  const { switchToConversation } = store.useConversation();
  const navigate = useNavigate();
  const getLikedConversationsQuery = useGetLikedConversationQuery(userId);

  const [conversations, setConversations] = useState<TConversation[]>([]);

  // Component to display liked conversations
  // Displays conversation title
  function ListItem({ convo }: { convo: TConversation }) {
    const [copied, setCopied] = useState<boolean>(false);
    const lang = useRecoilValue(store.lang);

    return(
      <div className="group relative flex flex-row items-center cursor-pointer my-2" >
        <div
          className='flex flex-row h-full w-full items-center rounded-lg px-2 py-2 gap-2 text-lg hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600'
          onClick={() => {
            if (convo.user === user?.id) {
              switchToConversation(convo);
              navigate(`/chat/${convo.conversationId}`);
            } else {
              navigate(`/chat/share/${convo.conversationId}`);
            }
          }}
        >
          <ConvoIcon />
          <div className='w-56 truncate'>
            {convo.title}
          </div>
        </div>
        <button
          className='visible absolute rounded-md right-1 z-10 p-1 hover:bg-gray-200 dark:text-gray-200 dark:hover:bg-gray-600'
          onClick={() => {
            if (copied === true) return;

            navigator.clipboard.writeText(window.location.host + `/chat/share/${convo.conversationId}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? (
            <div className='flex flex-row items-center gap-1 w-[92px]'>
              <svg
                stroke="currentColor"
                fill="none"
                strokeWidth="2"
                viewBox="0 0 24 24"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                height="1em"
                width="1em"
                xmlns="http://www.w3.org/2000/svg"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              {localize(lang, 'com_ui_copy_success')}
            </div>
          ) : (
            <div className='flex flex-row items-center gap-1 w-[92px]'>
              <svg className="h-5 w-5" width="1em" height="1em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <g id="Communication / Share_iOS_Export">
                  <path id="Vector" d="M9 6L12 3M12 3L15 6M12 3V13M7.00023 10C6.06835 10 5.60241 10 5.23486 10.1522C4.74481 10.3552 4.35523 10.7448 4.15224 11.2349C4 11.6024 4 12.0681 4 13V17.8C4 18.9201 4 19.4798 4.21799 19.9076C4.40973 20.2839 4.71547 20.5905 5.0918 20.7822C5.5192 21 6.07899 21 7.19691 21H16.8036C17.9215 21 18.4805 21 18.9079 20.7822C19.2842 20.5905 19.5905 20.2839 19.7822 19.9076C20 19.4802 20 18.921 20 17.8031V13C20 12.0681 19.9999 11.6024 19.8477 11.2349C19.6447 10.7448 19.2554 10.3552 18.7654 10.1522C18.3978 10 17.9319 10 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </g>
              </svg>
              {localize(lang, 'com_ui_share')}
            </div>
          )}
        </button>
      </div>
    );
  }

  useEffect(() => {
    getLikedConversationsQuery.refetch();
  }, []);

  useEffect(() => {
    if (getLikedConversationsQuery.isSuccess) {
      setConversations(getLikedConversationsQuery.data);
    }
  }, [getLikedConversationsQuery.isSuccess, getLikedConversationsQuery.data]);

  return(
    <div>
      {getLikedConversationsQuery.isLoading ? (
        <Spinner />
      ) : (
        <>
          {
            conversations.map((convo) => <ListItem key={convo.conversationId} convo={convo}/>)
          }
        </>
      )}
    </div>
  );
}

export default LikedConversations;