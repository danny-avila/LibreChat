import React from 'react';
import { cn } from '~/utils/';
import Clipboard from '../svg/Clipboard';
import CheckMark from '../svg/CheckMark';
import EditIcon from '../svg/EditIcon';
import RegenerateIcon from '../svg/RegenerateIcon';

export default function HoverButtons({
  isEditting,
  enterEdit,
  copyToClipboard,
  conversation,
  isSubmitting,
  message,
  regenerate,
}) {
  const { endpoint } = conversation;
  const [isCopied, setIsCopied] = React.useState(false);

  const branchingSupported =
    // azureOpenAI, openAI, chatGPTBrowser support branching, so edit enabled // 5/21/23: Bing is allowing editing and Message regenerating
    !![
      'azureOpenAI',
      'openAI',
      'chatGPTBrowser',
      'google',
      'bingAI',
      'gptPlugins',
      'anthropic',
    ].find((e) => e === endpoint);
  // Sydney in bingAI supports branching, so edit enabled

  const editEnabled =
    !message?.error &&
    message?.isCreatedByUser &&
    !message?.searchResult &&
    !isEditting &&
    branchingSupported;

  // for now, once branching is supported, regerate will be enabled
  let regenerateEnabled =
    // !message?.error &&
    !message?.isCreatedByUser &&
    !message?.searchResult &&
    !isEditting &&
    !isSubmitting &&
    branchingSupported;

  return (
    <div className="visible mt-2 flex justify-center gap-3 self-end text-gray-400 md:gap-4 lg:absolute lg:right-0 lg:top-0 lg:mt-0 lg:translate-x-full lg:gap-1 lg:self-center lg:pl-2">
      {editEnabled ? (
        <button
          className="hover-button rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible"
          onClick={enterEdit}
          type="button"
          title="edit"
        >
          {/* <button className="rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"> */}
          <EditIcon />
        </button>
      ) : null}
      {regenerateEnabled ? (
        <button
          className="hover-button active rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible"
          onClick={regenerate}
          type="button"
          title="regenerate"
        >
          {/* <button className="rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400"> */}
          <RegenerateIcon />
        </button>
      ) : null}

      <button
        className={cn(
          'hover-button rounded-md p-1 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200 disabled:dark:hover:text-gray-400 md:invisible md:group-hover:visible',
          message?.isCreatedByUser ? '' : 'active',
        )}
        onClick={() => copyToClipboard(setIsCopied)}
        type="button"
        title={isCopied ? 'Copied to clipboard' : 'Copy to clipboard'}
      >
        {isCopied ? <CheckMark /> : <Clipboard />}
      </button>
    </div>
  );
}
