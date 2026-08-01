import { memo, useCallback } from "react";
import { useRecoilValue } from "recoil";
import { SquarePen } from "lucide-react";
import { QueryKeys } from "librechat-data-provider";
import { useQueryClient } from "@tanstack/react-query";
import { TooltipAnchor } from "@librechat/client";
import {
	useShortcutAriaKey,
	useShortcutHint,
} from "~/hooks/useKeyboardShortcuts";
import { useLocalize, useNewConvo } from "~/hooks";
import { clearMessagesCache } from "~/utils";
import store from "~/store";

export const NewChatButton = memo(function NewChatButton({
	side = "bottom",
}: {
	side?: "top" | "bottom" | "left" | "right";
}) {
	const localize = useLocalize();
	const queryClient = useQueryClient();
	const { newConversation } = useNewConvo();
	const conversationId = useRecoilValue(store.conversationIdByIndex(0));
	const tooltipDescription = useShortcutHint(
		"newChat",
		localize("com_ui_new_chat"),
	);
	const ariaKey = useShortcutAriaKey("newChat");

	const handleClick = useCallback(
		(e: React.MouseEvent<HTMLAnchorElement>) => {
			if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
				e.preventDefault();
				clearMessagesCache(queryClient, conversationId);
				queryClient.invalidateQueries([QueryKeys.messages]);
				newConversation();
			}
		},
		[queryClient, conversationId, newConversation],
	);

	return (
		<TooltipAnchor
			side={side}
			description={tooltipDescription}
			render={
				<a
					href="/c/new"
					data-testid="new-chat-button"
					aria-label={localize("com_ui_new_chat")}
					aria-keyshortcuts={ariaKey}
					className="flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-surface-hover"
					onClick={handleClick}
				>
					<SquarePen className="h-5 w-5 text-text-primary" />
				</a>
			}
		/>
	);
});
