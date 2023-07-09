import React from 'react';
import EyeIcon from '../svg/EyeIcon';
import CrossedEyeIcon from '../svg/CrossedEyeIcon';

export default function PrivateButton({ isPrivate, setPrivateHandler, twcss }) {
  const classProp = { className: 'p-1 hover:text-white' };
  const title = `将对话设置为${isPrivate ? '公开' : '私密'}。\n\n私密：其他用户不会看到此对话。\n公开：其他用户有可能在首页看到此对话，并且可以在现有对话内容的基础下创建一个新对话。`;
  if (twcss) {
    classProp.className = twcss;
  }
  return (
    <button {...classProp} title={title} onClick={setPrivateHandler}>
      {isPrivate ? <CrossedEyeIcon /> : <EyeIcon />}
    </button>
  );
}
