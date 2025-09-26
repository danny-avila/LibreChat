import { useEffect, useRef } from "react";
import { Constants } from "librechat-data-provider";
import { useResetRecoilState } from "recoil";
import { logger } from "~/utils";
import { useChatContext } from "~/Providers";
import { canvasState } from "~/store/canvas";

export default function useCanvas() {
  const { conversation } = useChatContext();

  const resetCanvasState = useResetRecoilState(canvasState);

  const prevConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    const resetState = () => {
      logger.log("canvas", "Resetting Canvas states for conversation change");
      resetCanvasState();
      prevConversationIdRef.current = conversation?.conversationId ?? null;
    };

    // Reset Canvas state when conversation changes or when starting new conversation
    if (
      conversation?.conversationId !== prevConversationIdRef.current &&
      prevConversationIdRef.current != null
    ) {
      resetState();
    } else if (conversation?.conversationId === Constants.NEW_CONVO) {
      resetState();
    }

    prevConversationIdRef.current = conversation?.conversationId ?? null;

    /** Resets Canvas when unmounting */
    return () => {
      logger.log("canvas", "Unmounting Canvas");
      resetState();
    };
  }, [conversation?.conversationId, resetCanvasState]);
}
