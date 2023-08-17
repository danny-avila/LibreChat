import { TConversation, useGetLikedConversationQuery } from '@librechat/data-provider';
import { useEffect, useState } from 'react';
import { Spinner } from '../svg';
import { useNavigate, useParams } from 'react-router-dom';
import ConvoIcon from '../svg/ConvoIcon';
import { useAuthContext } from '~/hooks/AuthContext';
import store from '~/store';

function LikedConversations() {
  const { user } = useAuthContext();
  const { userId = '' } = useParams();
  const { switchToConversation } = store.useConversation();
  const navigate = useNavigate();
  const getLikedConversationsQuery = useGetLikedConversationQuery(userId);

  const [conversations, setConversations] = useState<TConversation[]>([]);

  function ListItem({ convo }: { convo: TConversation }) {
    return(
      <a
        className="flex flex-row items-center text-lg gap-2 cursor-pointer px-2 py-2 my-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
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
        {convo.title}
      </a>
    );
  }

  useEffect(() => {
    if (getLikedConversationsQuery.isSuccess) {
      setConversations(getLikedConversationsQuery.data);
    }
  }, [getLikedConversationsQuery.isSuccess]);

  return(
    <div className="overflow-y-auto">
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