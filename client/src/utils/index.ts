export * from './map';
export * from './json';
export * from './files';
export * from './latex';
export * from './convos';
export * from './presets';
export * from './textarea';
export * from './messages';
export * from './languages';
export * from './endpoints';
export * from './sharedLink';
export { default as cn } from './cn';
export { default as buildTree } from './buildTree';
export { default as getLoginError } from './getLoginError';
export { default as cleanupPreset } from './cleanupPreset';
export { default as validateIframe } from './validateIframe';
export { default as buildDefaultConvo } from './buildDefaultConvo';
export { default as getDefaultEndpoint } from './getDefaultEndpoint';
export { default as getLocalStorageItems } from './getLocalStorageItems';

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
  'rounded-md border border-gray-200 focus:border-gray-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-700 dark:border-gray-600 dark:focus:bg-gray-600 dark:focus:border-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:outline-none';

export const optionText =
  'p-0 shadow-none text-right pr-1 h-8 border-transparent hover:bg-gray-800/10 dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors';

export const defaultTextPropsLabel =
  'rounded-md border border-gray-300 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.10)] outline-none placeholder:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-700 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-600 dark:focus:outline-none';

export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
