import type { TFile } from 'librechat-data-provider';
import { FileImage, FileText, type LucideIcon } from 'lucide-react';

// Which icon to render for each mimetype's type (aka <type>/<subtype>)
// If it's undefined, we'll just render no icon at all
const TYPE_TO_ICON: Record<string, LucideIcon> = {
  application: FileText,
  text: FileText,
  image: FileImage,
};

/**
 * Displays an icon stylized for each file type.
 */
export default function FileIcon({ file }: { file: TFile }) {
  const type = file.type.split('/')[0];
  const Icon = TYPE_TO_ICON[type];

  return (
    <div
      className="text-md file-icon flex h-10 w-10 flex-shrink-0 items-center justify-center rounded"
      aria-hidden="true"
    >
      {Icon && <Icon aria-hidden="true" />}
    </div>
  );
}
