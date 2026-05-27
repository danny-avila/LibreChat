import type { TFile } from 'librechat-data-provider';
import mime from 'mime';
import { cn } from '~/utils';

const EXTENSION_SPECIAL_CASES: Record<string, string> = {
  'text/css': 'css',
  'text/javascript': 'js',
  'text/x-c': 'c',
  'text/x-c++': 'cpp',
  'text/x-csharp': 'cs',
  'text/x-go': 'go',
  'text/x-java': 'java',
  'text/x-kotlin': 'kt',
  'text/x-lua': 'lua',
  'text/markdown': 'md',
  'text/x-perl': 'pl',
  'text/x-python': 'py',
  'text/x-r': 'r',
  'text/x-ruby': 'rb',
  'text/x-rust': 'rs',
  'text/x-scala': 'scala',
  'text/x-swift': 'swift',
  'text/x-typescript': 'ts',
};

function getExtension(mimetype: string): string {
  // Special cases not covered by automatic finder (or not covered well)
  if (mimetype in EXTENSION_SPECIAL_CASES) {
    return EXTENSION_SPECIAL_CASES[mimetype];
  }

  // @ts-ignore - LibreChat is using the wrong TS specs w/ their version of mime
  return mime.getExtension(mimetype) ?? 'file';
}

const TYPE_TO_CLASS: Record<string, string> = {
  application: 'file-icon-application',
  audio: 'file-icon-audio',
  image: 'file-icon-image',
  text: 'file-icon-text',
  video: 'file-icon-video',
};

function getClassName(mimetype: string): string {
  const type = mimetype.split('/')[0];
  return TYPE_TO_CLASS[type] ?? 'file-icon-default';
}

/**
 * Displays an icon stylized for each file type.
 */
export default function FileIcon({ file }: { file: TFile }) {
  const extension = getExtension(file.type);
  const className = getClassName(file.type);
  const textSizeClass = extension.length < 4 ? 'text-sm' : 'text-xs';

  return (
    <div
      className={cn(
        'text-md flex h-10 w-10 flex-shrink-0 items-center justify-center rounded',
        className,
        textSizeClass,
      )}
      aria-hidden="true"
    >
      {extension.toLocaleUpperCase('en-US')}
    </div>
  );
}
