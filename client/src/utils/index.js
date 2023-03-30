import { clsx } from 'clsx';
import React from 'react';
import { twMerge } from 'tailwind-merge';
import GPTIcon from '../components/svg/GPTIcon';
import BingIcon from '../components/svg/BingIcon';

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export const languages = [
  'java',
  'c',
  'markdown',
  'css',
  'html',
  'xml',
  'bash',
  'json',
  'yaml',
  'jsx',
  'python',
  'c++',
  'javascript',
  'csharp',
  'php',
  'typescript',
  'swift',
  'objectivec',
  'sql',
  'r',
  'kotlin',
  'ruby',
  'go',
  'x86asm',
  'matlab',
  'perl',
  'pascal'
];

export const getIconOfAi = ({
  size = 30,
  sender,
  isCreatedByUser,
  searchResult,
  model,
  chatGptLabel,
  error,
  ...props
}) => {
  const { button } = props;
  const bgColors = {
    chatgpt: `rgb(16, 163, 127${button ? ', 0.75' : ''})`,
    chatgptBrowser: `rgb(25, 207, 207${button ? ', 0.75' : ''})`,
    bingai: 'transparent',
    sydney: 'radial-gradient(circle at 90% 110%, #F0F0FA, #D0E0F9)',
    chatgptCustom: `rgb(0, 163, 255${button ? ', 0.75' : ''})`
  };

  if (isCreatedByUser)
    return (
      <div
        title="User"
        style={{
          background: 'radial-gradient(circle at 90% 110%, rgb(1 43 128), rgb(17, 139, 161))',
          color: 'white',
          fontSize: 12,
          width: size,
          height: size
        }}
        className={`relative flex items-center justify-center rounded-sm text-white ` + props?.className}
      >
        User
      </div>
    );
  else if (!isCreatedByUser) {
    // TODO: use model from convo, rather than submit
    // const { model, chatGptLabel, promptPrefix } = convo;
    let background = bgColors[model];
    const isBing = model === 'bingai' || model === 'sydney';

    return (
      <div
        title={chatGptLabel || model}
        style={{
          background: background || 'radial-gradient(circle at 90% 110%, #F0F0FA, #D0E0F9)',
          width: size,
          height: size
        }}
        className={`relative flex items-center justify-center rounded-sm text-white ` + props?.className}
      >
        {isBing ? <BingIcon size={size * 0.7} /> : <GPTIcon size={size * 0.7} />}
        {error && (
          <span className="absolute right-0 top-[20px] -mr-2 flex h-4 w-4 items-center justify-center rounded-full border border-white bg-red-500 text-[10px] text-white">
            !
          </span>
        )}
      </div>
    );
  } else
    return (
      <div
        title="User"
        style={{
          background: 'radial-gradient(circle at 90% 110%, rgb(1 43 128), rgb(17, 139, 161))',
          color: 'white',
          fontSize: 12,
          width: size,
          height: size
        }}
        className={`relative flex items-center justify-center rounded-sm p-1 text-white ` + props?.className}
      >
        {chatGptLabel}
      </div>
    );
};
