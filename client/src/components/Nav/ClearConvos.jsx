import React from "react";
import TrashIcon from "../svg/TrashIcon";
import { useSWRConfig } from "swr";
import manualSWR from "~/utils/fetchers";

import store from "~/store";

export default function ClearConvos() {
  const { newConversation } = store.useConversation();
  const { refreshConversations } = store.useConversations();
  const { mutate } = useSWRConfig();

  const { trigger } = manualSWR(`/api/convos/clear`, "post", () => {
    newConversation();
    refreshConversations();
  });

  const clickHandler = () => {
    console.log("Clearing conversations...");
    trigger({});
  };

  return (
    <a
      className="flex cursor-pointer items-center gap-3 rounded-md py-3 px-3 text-sm text-white transition-colors duration-200 hover:bg-gray-500/10"
      onClick={clickHandler}
    >
      <TrashIcon />
      Clear conversations
    </a>
  );
}
