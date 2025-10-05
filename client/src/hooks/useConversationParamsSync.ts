import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useRecoilValue } from 'recoil';
import { Constants } from 'librechat-data-provider';
import { createChatSearchParams } from '~/utils';
import { createSearchParams } from 'react-router-dom';
import store from '~/store';

export function useConversationParamsSync(index: string | number) {
  const conversation = useRecoilValue(store.conversationByIndex(index));
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!conversation) {
      return;
    }

    const disableParams = conversation.disableParams === true;
    const shouldUpdateParams =
      Number(index) === 0 &&
      !disableParams &&
      conversation.createdAt === '' &&
      conversation.conversationId === Constants.NEW_CONVO;

    if (shouldUpdateParams) {
      const newParams = createChatSearchParams(conversation);
      const searchParams = createSearchParams(newParams);
      const newSearch = searchParams.toString();

      if (location.search !== `?${newSearch}`) {
        navigate(`${location.pathname}?${newSearch}`, { replace: true });
      }
    }
  }, [conversation, index, location.pathname, location.search, navigate]);
}
