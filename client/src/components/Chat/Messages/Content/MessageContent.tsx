import React, { memo, Suspense, useMemo, useEffect, useState } from 'react';
import { useRecoilValue } from 'recoil';
import type { TMessage } from 'librechat-data-provider';
import type { TMessageContentProps, TDisplayProps } from '~/common';
import Error from '~/components/Messages/Content/Error';
import Thinking from '~/components/Artifacts/Thinking';
import { DelayedRender } from '~/components/ui';
import { useChatContext } from '~/Providers';
import MarkdownLite from './MarkdownLite';
import EditMessage from './EditMessage';
import { useLocalize } from '~/hooks';
import Container from './Container';
import Markdown from './Markdown';
import { cn } from '~/utils';
import store from '~/store';
import { useAuthContext } from '~/hooks/AuthContext';

/**
 * Helper: Converts a base64 string to an ArrayBuffer.
 */
const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
  const binaryStr = window.atob(base64);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
};

/**
 * Helper: Decrypts an encrypted chat message using the provided RSA private key.
 * Expects the message object to have: text (ciphertext), iv, authTag, and encryptedKey.
 */
async function decryptChatMessage(
  msg: { text: string; iv: string; authTag: string; encryptedKey: string },
  privateKey: CryptoKey
): Promise<string> {
  // Convert base64 values to ArrayBuffers.
  const ciphertextBuffer = base64ToArrayBuffer(msg.text);
  const ivBuffer = new Uint8Array(base64ToArrayBuffer(msg.iv));
  const authTagBuffer = new Uint8Array(base64ToArrayBuffer(msg.authTag));
  const encryptedKeyBuffer = base64ToArrayBuffer(msg.encryptedKey);

  // Decrypt the AES key using RSA-OAEP.
  let aesKeyRaw: ArrayBuffer;
  try {
    aesKeyRaw = await window.crypto.subtle.decrypt(
      { name: 'RSA-OAEP' },
      privateKey,
      encryptedKeyBuffer
    );
  } catch (err) {
    console.error('Failed to decrypt AES key:', err);
    throw err;
  }

  // Import the AES key.
  const aesKey = await window.crypto.subtle.importKey(
    'raw',
    aesKeyRaw,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // Combine ciphertext and auth tag (Web Crypto expects them appended).
  const ciphertextBytes = new Uint8Array(ciphertextBuffer);
  const combined = new Uint8Array(ciphertextBytes.length + authTagBuffer.length);
  combined.set(ciphertextBytes);
  combined.set(authTagBuffer, ciphertextBytes.length);

  // Decrypt the message using AES-GCM.
  let decryptedBuffer: ArrayBuffer;
  try {
    decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuffer },
      aesKey,
      combined.buffer
    );
  } catch (err) {
    console.error('Failed to decrypt message:', err);
    throw err;
  }
  return new TextDecoder().decode(decryptedBuffer);
}

export const ErrorMessage = ({
  text,
  message,
  className = '',
}: Pick<TDisplayProps, 'text' | 'className'> & {
  message?: TMessage;
}) => {
  const localize = useLocalize();
  if (text === 'Error connecting to server, try refreshing the page.') {
    console.log('error message', message);
    return (
      <Suspense
        fallback={
          <div className="text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
            <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
              <div className="absolute">
                <p className="submitting relative">
                  <span className="result-thinking" />
                </p>
              </div>
            </div>
          </div>
        }
      >
        <DelayedRender delay={5500}>
          <Container message={message}>
            <div className={cn('rounded-md border border-red-500 bg-red-500/10 px-3 py-2 text-sm text-gray-600 dark:text-gray-200', className)}>
              {localize('com_ui_error_connection')}
            </div>
          </Container>
        </DelayedRender>
      </Suspense>
    );
  }
  return (
    <Container message={message}>
      <div
        role="alert"
        aria-live="assertive"
        className={cn('rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-sm text-gray-600 dark:text-gray-200', className)}
      >
        <Error text={text} />
      </div>
    </Container>
  );
};

const DisplayMessage = ({ text, isCreatedByUser, message, showCursor, className = '' }: TDisplayProps) => {
  const { isSubmitting, latestMessage } = useChatContext();
  const { user } = useAuthContext();
  const enableUserMsgMarkdown = useRecoilValue(store.enableUserMsgMarkdown);
  const showCursorState = useMemo(() => showCursor === true && isSubmitting, [showCursor, isSubmitting]);
  const isLatestMessage = useMemo(() => message.messageId === latestMessage?.messageId, [message.messageId, latestMessage?.messageId]);

  // State to hold the final text to display (decrypted if needed)
  const [displayText, setDisplayText] = useState<string>(text);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  useEffect(() => {
    if (message.encryptedKey && user?.decryptedPrivateKey) {
      // Attempt to decrypt the message using our helper.
      decryptChatMessage(
        {
          text: message.text,
          iv: message.iv,
          authTag: message.authTag,
          encryptedKey: message.encryptedKey,
        },
        user.decryptedPrivateKey
      )
        .then((plainText) => {
          setDisplayText(plainText);
          setDecryptionError(null);
        })
        .catch((err) => {
          console.error('Error decrypting message:', err);
          setDecryptionError('Decryption error');
          setDisplayText('');
        });
    } else {
      // If no encryption metadata or no private key, display plain text.
      setDisplayText(text);
      setDecryptionError(null);
    }
  }, [text, message, user]);

  let content: React.ReactElement;
  if (!isCreatedByUser) {
    content = <Markdown content={displayText} showCursor={showCursorState} isLatestMessage={isLatestMessage} />;
  } else if (enableUserMsgMarkdown) {
    content = <MarkdownLite content={displayText} />;
  } else {
    content = <>{displayText}</>;
  }

  return (
    <Container message={message}>
      <div className={cn(
        isSubmitting ? 'submitting' : '',
        showCursorState && !!displayText.length ? 'result-streaming' : '',
        'markdown prose message-content dark:prose-invert light w-full break-words',
        isCreatedByUser && !enableUserMsgMarkdown && 'whitespace-pre-wrap',
        isCreatedByUser ? 'dark:text-gray-20' : 'dark:text-gray-100',
        className
      )}>
        {decryptionError ? <span className="text-red-500">{decryptionError}</span> : content}
      </div>
    </Container>
  );
};

// Unfinished Message Component
export const UnfinishedMessage = ({ message }: { message: TMessage }) => (
  <ErrorMessage
    message={message}
    text="The response is incomplete; it's either still processing, was cancelled, or censored. Refresh or try a different prompt."
  />
);

const MessageContent = ({
  text,
  edit,
  error,
  unfinished,
  isSubmitting,
  isLast,
  ...props
}: TMessageContentProps) => {
  const { message } = props;
  const { messageId } = message;

  const { thinkingContent, regularContent } = useMemo(() => {
    const thinkingMatch = text.match(/:::thinking([\s\S]*?):::/);
    return {
      thinkingContent: thinkingMatch ? thinkingMatch[1].trim() : '',
      regularContent: thinkingMatch ? text.replace(/:::thinking[\s\S]*?:::/, '').trim() : text,
    };
  }, [text]);

  const showRegularCursor = useMemo(() => isLast && isSubmitting, [isLast, isSubmitting]);

  const unfinishedMessage = useMemo(
    () =>
      !isSubmitting && unfinished ? (
        <Suspense>
          <DelayedRender delay={250}>
            <UnfinishedMessage message={message} />
          </DelayedRender>
        </Suspense>
      ) : null,
    [isSubmitting, unfinished, message],
  );

  if (error) {
    return <ErrorMessage message={props.message} text={text} />;
  } else if (edit) {
    return <EditMessage text={text} isSubmitting={isSubmitting} {...props} />;
  }

  return (
    <>
      {thinkingContent.length > 0 && (
        <Thinking key={`thinking-${messageId}`}>{thinkingContent}</Thinking>
      )}
      <DisplayMessage key={`display-${messageId}`} showCursor={showRegularCursor} text={regularContent} {...props} />
      {unfinishedMessage}
    </>
  );
};

export default memo(MessageContent);