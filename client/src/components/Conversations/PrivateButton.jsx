import React from 'react';
import EyeIcon from '../svg/EyeIcon';
import CrossedEyeIcon from '../svg/CrossedEyeIcon';
import { useLocalize } from '~/hooks';

export default function PrivateButton({ isPrivate, setPrivateHandler }) {
  const localize = useLocalize();

  const classProp = {
    className: 'flex flex-row gap-1 items-center px-1 hover:bg-gray-200 hover:dark:bg-gray-600',
  };
  const title = `将对话设置为${
    isPrivate ? '公开' : '私密'
  }。\n\n私密：其他用户不会看到此对话。\n公开：其他用户有可能在首页看到此对话，并且可以在现有对话内容的基础下创建一个新对话。`;
  return (
    <button {...classProp} title={title} onClick={setPrivateHandler}>
      {isPrivate ? <CrossedEyeIcon /> : <EyeIcon />}
      {isPrivate ? localize('com_ui_private') : localize('com_ui_public')}
    </button>
  );
}
