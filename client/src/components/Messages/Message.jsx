import React, { useState, useEffect, useRef } from 'react';
import TextWrapper from './TextWrapper';
import { useSelector, useDispatch } from 'react-redux';
import GPTIcon from '../svg/GPTIcon';
import BingIcon from '../svg/BingIcon';
import HoverButtons from './HoverButtons';
import Spinner from '../svg/Spinner';
import { setError } from '~/store/convoSlice';
import { setMessages } from '~/store/messageSlice';
import { setSubmitState, setSubmission } from '~/store/submitSlice';
import { setText } from '~/store/textSlice';

export default function Message({
  message,
  messages,
  last = false,
  scrollToBottom,
  edit,
  currentEditIdx,
  enterEdit
}) {
  const { isSubmitting, model, chatGptLabel, promptPrefix } = useSelector((state) => state.submit);
  const [abortScroll, setAbort] = useState(false);
  const { sender, text, isCreatedByUser, error } = message
  const textEditor = useRef(null)
  const convo = useSelector((state) => state.convo);
  const { initial } = useSelector((state) => state.models);
  const { error: convoError } = convo;

  const dispatch = useDispatch();

  // const notUser = !isCreatedByUser; // sender.toLowerCase() !== 'user';
  const blinker = isSubmitting && last && !isCreatedByUser;

  useEffect(() => {
    if (blinker && !abortScroll) {
      scrollToBottom();
    }
  }, [isSubmitting, text, blinker, scrollToBottom, abortScroll]);
  
  if (sender === '') {
    return <Spinner />;
  }

  const handleWheel = () => {
    if (blinker) {
      setAbort(true);
    } else {
      setAbort(false);
    }
  };

  const props = {
    className:
      'w-full border-b border-black/10 dark:border-gray-900/50 text-gray-800 bg-white dark:text-gray-100 group dark:bg-gray-800'
  };

  const bgColors = {
    chatgpt: 'rgb(16, 163, 127)',
    chatgptBrowser: 'rgb(25, 207, 207)',
    bingai: '',
    sydney: ''
  };

  const isBing = sender === 'bingai' || sender === 'sydney';

  let icon = `${sender}:`;
  let backgroundColor = bgColors[sender];

  if (!isCreatedByUser) {
    props.className =
      'w-full border-b border-black/10 bg-gray-50 dark:border-gray-900/50 text-gray-800 dark:text-gray-100 group bg-gray-100 dark:bg-[#444654]';
  }

  if ((!isCreatedByUser && backgroundColor) || isBing) {
    icon = (
      <div
        style={
          isBing
            ? { background: 'radial-gradient(circle at 90% 110%, #F0F0FA, #D0E0F9)' }
            : { backgroundColor }
        }
        className="relative flex h-[30px] w-[30px] items-center justify-center rounded-sm p-1 text-white"
      >
        {isBing ? <BingIcon /> : <GPTIcon />}
        {error && (
          <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
            !
          </span>
        )}
      </div>
    );
  }

  const wrapText = (text) => <TextWrapper text={text} />;

  const resubmitMessage = () => {
    const text = textEditor.current.innerHTML

    if (convoError) {
      dispatch(setError(false));
    }

    if (!!isSubmitting || text.trim() === '') {
      return;
    }

    const isCustomModel = model === 'chatgptCustom' || !initial[model];
    const currentMsg = { ...message, sender: 'User', text: text.trim(), current: true, isCreatedByUser: true };
    console.log(model)
    const sender = model === 'chatgptCustom' ? chatGptLabel : model;

    const initialResponse = { sender, text: '' };

    dispatch(setSubmitState(true));
    dispatch(setMessages([...messages.slice(0, currentEditIdx), currentMsg, initialResponse]));
    dispatch(setText(''));

    const submission = {
      isCustomModel,
      message: { 
        ...message, 
        text: text.trim(),
        model,
        chatGptLabel,
        promptPrefix,
      },
      messages: messages.slice(0, currentEditIdx),
      currentMsg,
      initialResponse,
      sender,
    };
    console.log('User Input:', message);
    // handleSubmit(submission);
    dispatch(setSubmission(submission));

    enterEdit(true);
  };

  return (
    <div
      {...props}
      onWheel={handleWheel}
    >
      <div className="m-auto flex gap-4 p-4 text-base md:max-w-2xl md:gap-6 md:py-6 lg:max-w-2xl lg:px-0 xl:max-w-3xl">
        <strong className="relative flex w-[30px] flex-col items-end text-right text-xs md:text-sm">
          {typeof icon === 'string' && icon.match(/[^\u0000-\u007F]+/) ? (
            <span className=" direction-rtl w-40 overflow-x-scroll">{icon}</span>
          ) : (
            icon
          )}
        </strong>
        <div className="relative flex w-[calc(100%-50px)] flex-col gap-1 whitespace-pre-wrap md:gap-3 lg:w-[calc(100%-115px)]">
          <div className="flex flex-grow flex-col gap-3">
            {error ? (
              <div className="flex flex min-h-[20px] flex-col flex-grow items-start gap-4 gap-2 whitespace-pre-wrap text-red-500">
                <div className="rounded-md border border-red-500 bg-red-500/10 py-2 px-3 text-sm text-gray-600 dark:text-gray-100">
                  {text}
                </div>
              </div>
            ) : 
              edit ? (
                <div className="flex min-h-[20px] flex-col flex-grow items-start gap-4 whitespace-pre-wrap">
                  {/* <div className={`${blinker ? 'result-streaming' : ''} markdown prose dark:prose-invert light w-full break-words`}> */}
                  
                  <div className="markdown prose dark:prose-invert light w-full break-words border-none" 
                    contentEditable={true} ref={textEditor} suppressContentEditableWarning={true}>
                    {text}
                  </div>
                  <div className="text-center mt-2 flex w-full justify-center">
                    <button
                      className="btn relative btn-primary mr-2"
                      disabled={isSubmitting}
                      onClick={resubmitMessage}
                    >
                      Save & Submit
                    </button>
                    <button
                      className="btn relative btn-neutral"
                      onClick={() => enterEdit(true)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex min-h-[20px] flex-col flex-grow items-start gap-4 whitespace-pre-wrap">
                  {/* <div className={`${blinker ? 'result-streaming' : ''} markdown prose dark:prose-invert light w-full break-words`}> */}
                  <div className="markdown prose dark:prose-invert light w-full break-words">
                    {!isCreatedByUser ? wrapText(text) : text}
                    {blinker && <span className="result-streaming">█</span>}
                  </div>
                </div>
              )}
          </div>
            <HoverButtons user={!error && isCreatedByUser} onClick={() => enterEdit()}/>
        </div>
      </div>
    </div>
  );
}
