import React from "react";
import {
  RecoilRoot,
  atom,
  selector,
  useRecoilState,
  useRecoilValue,
  useSetRecoilState,
} from "recoil";

const refreshConversationsHint = atom({
  key: "refreshConversationsHint",
  default: 1,
});

const useConversations = () => {
  const setRefreshConversationsHint = useSetRecoilState(
    refreshConversationsHint
  );

  const refreshConversations = () =>
    setRefreshConversationsHint((prevState) => prevState + 1);

  return { refreshConversations };
};

export default { refreshConversationsHint, useConversations };
