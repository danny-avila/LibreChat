import React, { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useRecoilState, useRecoilValue, useSetRecoilState } from "recoil";

import Landing from "../components/ui/Landing";
import Messages from "../components/Messages";
import TextChat from "../components/Input";

import store from "~/store";
import manualSWR from "~/utils/fetchers";
// import TextChat from './components/Main/TextChat';

// {/* <TextChat messages={messages} /> */}

export default function Chat() {
  const [conversation, setConversation] = useRecoilState(store.conversation);
  const setMessages = useSetRecoilState(store.messages);
  const messagesTree = useRecoilValue(store.messagesTree);
  const { newConversation } = store.useConversation();
  const { conversationId } = useParams();
  const navigate = useNavigate();

  const { trigger: messagesTrigger } = manualSWR(
    `/api/messages/${conversation?.conversationId}`,
    "get"
  );

  const { trigger: conversationTrigger } = manualSWR(
    `/api/convos/${conversationId}`,
    "get"
  );

  // when conversation changed or conversationId (in url) changed
  useEffect(() => {
    if (conversation === null) {
      // no current conversation, we need to do something
      if (conversationId == "new") {
        // create new
        newConversation();
      } else {
        // fetch it from server
        conversationTrigger().then(setConversation);
        setMessages(null);
        console.log("NEED TO FETCH DATA");
      }
    } else if (conversation?.conversationId !== conversationId)
      // conversationId (in url) should always follow conversation?.conversationId, unless conversation is null
      navigate(`/chat/${conversation?.conversationId}`);
  }, [conversation, conversationId]);

  // when messagesTree is null (<=> messages is null)
  // we need to fetch message list from server
  useEffect(() => {
    if (messagesTree === null) {
      messagesTrigger().then(setMessages);
    }
  }, [conversation?.conversationId]);

  if (conversation?.conversationId !== conversationId) return null;

  return (
    <>
      {conversationId == "new" ? <Landing /> : <Messages />}
      <TextChat />
    </>
  );
}
