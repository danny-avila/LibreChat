import React from 'react';

export * from './map';
export * from './json';
export * from './files';
export * from './latex';
export * from './forms';
export * from './agents';
export * from './drafts';
export * from './convos';
export * from './routes';
export * from './presets';
export * from './prompts';
export * from './textarea';
export * from './messages';
export * from './languages';
export * from './endpoints';
export * from './resources';
export * from './roles';
export * from './localStorage';
export * from './promptGroups';
export * from './email';
export * from './timestamps';
export { default as cn } from './cn';
export { default as logger } from './logger';
export { default as scaleImage } from './scaleImage';
export { default as getLoginError } from './getLoginError';
export { default as cleanupPreset } from './cleanupPreset';
export { default as buildDefaultConvo } from './buildDefaultConvo';
export { default as getDefaultEndpoint } from './getDefaultEndpoint';
export { default as createChatSearchParams } from './createChatSearchParams';
export { getThemeFromEnv } from './getThemeFromEnv';

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
  'pascal',
];

export const removeFocusOutlines = '';
export const removeFocusRings =
  'focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0';

export const cardStyle =
  'transition-colors rounded-md min-w-[75px] border font-normal bg-white hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700 dark:bg-gray-800 text-black dark:text-gray-600 focus:outline-none data-[state=open]:bg-gray-50 dark:data-[state=open]:bg-gray-700';

export const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-gray-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none focus-within:placeholder:text-text-primary focus:placeholder:text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:focus:bg-gray-600 dark:focus:border-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:outline-none';

export const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent hover:bg-gray-800/10 dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors';

export const defaultTextPropsLabel =
  'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none focus-within:placeholder:text-text-primary focus:placeholder:text-text-primary placeholder:text-text-secondary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-600 dark:focus:outline-none';

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export const handleDoubleClick: React.MouseEventHandler<HTMLElement> = (event) => {
  const range = document.createRange();
  range.selectNodeContents(event.target as Node);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
};

export const extractContent = (
  children: React.ReactNode | { props: { children: React.ReactNode } } | string,
): string => {
  if (typeof children === 'string') {
    return children;
  }
  if (React.isValidElement(children)) {
    return extractContent((children.props as { children?: React.ReactNode }).children);
  }
  if (Array.isArray(children)) {
    return children.map(extractContent).join('');
  }
  return '';
};

export const normalizeLayout = (layout: number[]) => {
  const sum = layout.reduce((acc, size) => acc + size, 0);
  if (Math.abs(sum - 100) < 0.01) {
    return layout.map((size) => Number(size.toFixed(2)));
  }

  const factor = 100 / sum;
  const normalizedLayout = layout.map((size) => Number((size * factor).toFixed(2)));

  const adjustedSum = normalizedLayout.reduce(
    (acc, size, index) => (index === layout.length - 1 ? acc : acc + size),
    0,
  );
  normalizedLayout[normalizedLayout.length - 1] = Number((100 - adjustedSum).toFixed(2));

  return normalizedLayout;
};
