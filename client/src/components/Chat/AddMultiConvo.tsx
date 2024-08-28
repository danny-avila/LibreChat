import { PlusCircle } from 'lucide-react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { mainTextareaId } from '~/common';
import { Button } from '~/components/ui';
import { cn } from '~/utils';

function AddMultiConvo({ className = '' }: { className?: string }) {
  const { conversation } = useChatContext();
  const { setConversation: setAddedConvo } = useAddedChatContext();

  const clickHandler = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { title: _t, ...convo } = conversation ?? ({} as TConversation);
    setAddedConvo({
      ...convo,
      title: '',
    });

    const textarea = document.getElementById(mainTextareaId);
    if (textarea) {
      textarea.focus();
    }
  };

  if (!conversation) {
    return null;
  }

  if (isAssistantsEndpoint(conversation.endpoint)) {
    return null;
  }

  return (
    <Button
      id="add-multi-conversation-button"
      aria-label="Add multi-conversation"
      onClick={clickHandler}
      variant="outline"
      className={cn('h-10 w-10 p-0 transition-all duration-300 ease-in-out', className)}
    >
      <PlusCircle size={16} />
    </Button>
  );
}

export default AddMultiConvo;
