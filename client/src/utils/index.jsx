import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

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

export const alternateName = {
  openAI: 'OpenAI',
  azureOpenAI: 'Azure OpenAI',
  bingAI: 'Bing',
  chatGPTBrowser: 'ChatGPT',
  gptPlugins: 'Plugins',
  google: 'PaLM',
  anthropic: 'Anthropic',
};

