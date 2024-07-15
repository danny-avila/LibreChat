import { PlusCircle } from 'lucide-react';
import { isAssistantsEndpoint } from 'librechat-data-provider';
import type { TConversation } from 'librechat-data-provider';
import { useChatContext, useAddedChatContext } from '~/Providers';
import { mainTextareaId } from '~/common';
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
    <button
      onClick={clickHandler}
      className={cn(
        'group m-1.5 flex w-fit cursor-pointer items-center rounded text-sm hover:bg-border-medium focus-visible:bg-border-medium focus-visible:outline-0',
        className,
      )}
    >
      <PlusCircle size={16} />
    </button>
  );
}

export default AddMultiConvo;
