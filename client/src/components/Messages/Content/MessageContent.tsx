import { useRef, Fragment } from 'react';
import { useRecoilState } from 'recoil';
import { useUpdateMessageMutation } from 'librechat-data-provider';
import type { TMessage, TResPlugin } from 'librechat-data-provider';
import type { TAskFunction } from '~/common';
import { cn, getError } from '~/utils';
import store from '~/store';
import Content from './Content';
import Plugin from './Plugin';

type TInitialProps = {
  text: string;
  edit: boolean;
  error: boolean;
  unfinished: boolean;
  isSubmitting: boolean;
};
type TAdditionalProps = {
  ask: TAskFunction;
  message: TMessage;
  isCreatedByUser: boolean;
  siblingIdx: number;
  enterEdit: (cancel: boolean) => void;
  setSiblingIdx: (value: number) => void;
};

type TMessageContent = TInitialProps & TAdditionalProps;

type TText = Pick<TInitialProps, 'text'>;
type TEditProps = Pick<TInitialProps, 'text' | 'isSubmitting'> &
  Omit<TAdditionalProps, 'isCreatedByUser'>;
type TDisplayProps = TText & Pick<TAdditionalProps, 'isCreatedByUser' | 'message'>;

// Container Component
const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-[20px] flex-grow flex-col items-start gap-4">{children}</div>
);

// Error Message Component
const ErrorMessage = ({ text }: TText) => (
  <Container>
    <div className="rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-100">
      {getError(text)}
    </div>
  </Container>
);

// Edit Message Component
const EditMessage = ({
  text,
  message,
  isSubmitting,
  ask,
  enterEdit,
  siblingIdx,
  setSiblingIdx,
}: TEditProps) => {
  const [messages, setMessages] = useRecoilState(store.messages);
  const textEditor = useRef<HTMLDivElement | null>(null);
  const { conversationId, parentMessageId, messageId } = message;
  const updateMessageMutation = useUpdateMessageMutation(conversationId ?? '');

  const resubmitMessage = () => {
    const text = textEditor?.current?.innerText ?? '';
    if (message.isCreatedByUser) {
      ask({
        text,
        parentMessageId,
        conversationId,
      });

      setSiblingIdx((siblingIdx ?? 0) - 1);
    } else {
      const parentMessage = messages?.find((msg) => msg.messageId === parentMessageId);

      if (!parentMessage) {
        return;
      }
      ask(
        { ...parentMessage },
        {
          editedText: text,
          editedMessageId: messageId,
          isRegenerate: true,
          isEdited: true,
        },
      );

      setSiblingIdx((siblingIdx ?? 0) - 1);
    }

    enterEdit(true);
  };

  const updateMessage = () => {
    if (!messages) {
      return;
    }
    const text = textEditor?.current?.innerText ?? '';
    updateMessageMutation.mutate({
      conversationId: conversationId ?? '',
      messageId,
      text,
    });
    setMessages(() =>
      messages.map((msg) =>
        msg.messageId === messageId
          ? {
            ...msg,
            text,
          }
          : msg,
      ),
    );
    enterEdit(true);
  };

  return (
    <Container>
      <div
        data-testid="message-text-editor"
        className="markdown prose dark:prose-invert light w-full whitespace-pre-wrap break-words border-none focus:outline-none"
        contentEditable={true}
        ref={textEditor}
        suppressContentEditableWarning={true}
      >
        {text}
      </div>
      <div className="mt-2 flex w-full justify-center text-center">
        <button
          className="btn btn-primary relative mr-2"
          disabled={isSubmitting}
          onClick={resubmitMessage}
        >
          Save & Submit
        </button>
        <button
          className="btn btn-secondary relative mr-2"
          disabled={isSubmitting}
          onClick={updateMessage}
        >
          Save
        </button>
        <button className="btn btn-neutral relative" onClick={() => enterEdit(true)}>
          Cancel
        </button>
      </div>
    </Container>
  );
};

// Display Message Component
const DisplayMessage = ({ text, isCreatedByUser, message }: TDisplayProps) => (
  <Container>
    <div
      className={cn(
        'markdown prose dark:prose-invert light w-full break-words',
        isCreatedByUser ? 'whitespace-pre-wrap' : '',
      )}
    >
      {!isCreatedByUser ? <Content content={text} message={message} /> : <>{text}</>}
    </div>
  </Container>
);

// Unfinished Message Component
const UnfinishedMessage = () => (
  <ErrorMessage text="This is an unfinished message. The AI may still be generating a response, it was aborted, or a censor was triggered. Refresh or visit later to see more updates." />
);

// Content Component
const MessageContent = ({
  text,
  edit,
  error,
  unfinished,
  isSubmitting,
  ...props
}: TMessageContent) => {
  if (error) {
    return <ErrorMessage text={text} />;
  } else if (edit) {
    return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  } else {
    const marker = ':::plugin:::\n';
    const splitText = text.split(marker);
    const { message } = props;
    const { plugins, messageId } = message;
    console.log('splitText', splitText);
    console.log('plugins', plugins);
    let emptyCount = 0;
    return splitText.map((text, idx) => {
      const currentText = text.trim();
      console.log('idx', idx);
      let plugin: TResPlugin | null = null;
      if (plugins) {
        plugin = plugins[idx];
      }

      if (currentText === '') {
        emptyCount++;
      }

      const showEmpty =
        isSubmitting && currentText.length === 0
          ? emptyCount === splitText.length
          : text?.length > 0;

      return (
        <Fragment key={idx}>
          {plugin && <Plugin key={`plugin-${messageId}-${idx}`} plugin={plugin} />}
          {showEmpty ? (
            <DisplayMessage key={`display-${messageId}-${idx}`} text={currentText} {...props} />
          ) : null}
          {!isSubmitting && unfinished && (
            <UnfinishedMessage key={`unfinished-${messageId}-${idx}`} />
          )}
        </Fragment>
      );
    });
  }
};

export default MessageContent;
