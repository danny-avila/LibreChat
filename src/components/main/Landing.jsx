import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { setText } from '~/store/textSlice';
import useDocumentTitle from '~/hooks/useDocumentTitle';
import Templates from '../Prompts/Templates';
import SunIcon from '../svg/SunIcon';
import LightningIcon from '../svg/LightningIcon';
import CautionIcon from '../svg/CautionIcon';
import ChatIcon from '../svg/ChatIcon';

export default function Landing({ title }) {
  const [showingTemplates, setShowingTemplates] = useState(false);
  const dispatch = useDispatch();
  useDocumentTitle(title);

  const clickHandler = (e) => {
    e.preventDefault();
    const { innerText } = e.target;
    const quote = innerText.split('"')[1].trim();
    dispatch(setText(quote));
  };

  const showTemplates = (e) => {
    e.preventDefault();
    setShowingTemplates(!showingTemplates);
  };

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto text-sm dark:bg-gray-800">
      <div className="w-full px-6 text-gray-800 dark:text-gray-100 md:flex md:max-w-2xl md:flex-col lg:max-w-3xl">
        <h1 className="mt-6 ml-auto mr-auto mb-10 flex items-center justify-center gap-2 text-center text-4xl font-semibold sm:mt-[20vh] sm:mb-16">
          ChatGPT Clone
        </h1>
        <div className="items-start gap-3.5 text-center md:flex">
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <SunIcon />
              Examples
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;Explain quantum computing in simple terms&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;Got any creative ideas for a 10 year old&apos;s birthday?&quot; →
              </button>
              <button
                onClick={clickHandler}
                className="w-full rounded-md bg-gray-50 p-3 hover:bg-gray-200 dark:bg-white/5 dark:hover:bg-gray-900"
              >
                &quot;How do I make an HTTP request in Javascript?&quot; →
              </button>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <LightningIcon />
              Capabilities
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                Remembers what user said earlier in the conversation
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                Allows user to provide follow-up corrections
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                Trained to decline inappropriate requests
              </li>
            </ul>
          </div>
          <div className="mb-8 flex flex-1 flex-col gap-3.5 md:mb-auto">
            <h2 className="m-auto flex items-center gap-3 text-lg font-normal md:flex-col md:gap-2">
              <CautionIcon />
              Limitations
            </h2>
            <ul className="m-auto flex w-full flex-col gap-3.5 sm:max-w-md">
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                May occasionally generate incorrect information
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                May occasionally produce harmful instructions or biased content
              </li>
              <li className="w-full rounded-md bg-gray-50 p-3 dark:bg-white/5">
                Limited knowledge of world and events after 2021
              </li>
            </ul>
          </div>
        </div>
        {!showingTemplates && (
          <div className="mt-8 mb-4 flex flex-col items-center gap-3.5 md:mt-16">
            <button
              onClick={showTemplates}
              className="btn btn-neutral justify-center gap-2 border-0 md:border"
            >
              <ChatIcon />
              Show Prompt Templates
            </button>
          </div>
        )}
        {!!showingTemplates && <Templates showTemplates={showTemplates}/>}
        <div className="group h-32 w-full flex-shrink-0 dark:border-gray-900/50 dark:bg-gray-800 md:h-48" />
      </div>
    </div>
  );
}
