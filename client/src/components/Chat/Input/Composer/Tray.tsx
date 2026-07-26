import { memo } from 'react';
import { TextQuote, WandSparkles } from 'lucide-react';
import type { TConversation } from 'librechat-data-provider';
import type { ComposerItem, ComposerItemKind } from '~/hooks/Input/useComposerItems';
import type { ExtendedFile, FileSetter } from '~/common';
import { useFileHandlingNoChatContext, useLocalize } from '~/hooks';
import Chip, { type ChipTone } from './Chip';
import FileRow from '../Files/FileRow';

const KIND_ICON: Record<ComposerItemKind, JSX.Element> = {
  quote: <TextQuote className="h-4 w-4" aria-hidden="true" />,
  skill: <WandSparkles className="h-4 w-4" aria-hidden="true" />,
};

const KIND_REMOVE_KEY = {
  quote: 'com_ui_remove_quote',
  skill: 'com_ui_remove_skill',
} as const;

function ItemChip({ item }: { item: ComposerItem }) {
  const localize = useLocalize();

  return (
    <Chip
      tone={item.kind as ChipTone}
      label={item.label}
      title={item.title}
      icon={KIND_ICON[item.kind]}
      onRemove={item.remove}
      removeLabel={localize(KIND_REMOVE_KEY[item.kind])}
      data-testid={`composer-chip-${item.kind}`}
    />
  );
}

interface TrayProps {
  items: ComposerItem[];
  conversation: TConversation | null;
  /** Staged uploads, rendered by `FileRow` with their own delete semantics. */
  files: Map<string, ExtendedFile>;
  setFiles: FileSetter;
  setFilesLoading: React.Dispatch<React.SetStateAction<boolean>>;
  isRTL: boolean;
}

/**
 * The composer's staged-context region: file cards first, then the quote and
 * manual-skill pills. Queued and failed-steer rows live elsewhere (the Queue
 * rail and the thread, respectively).
 *
 * Files keep `FileRow` rather than being flattened into pills: the card is
 * where an image preview opens full size, where upload progress and the storage
 * source are drawn, and where aborting a part-done upload differs from deleting
 * a finished one.
 */
function Tray({ items, conversation, files, setFiles, setFilesLoading, isRTL }: TrayProps) {
  const localize = useLocalize();
  const { abortUpload } = useFileHandlingNoChatContext(undefined, {
    files,
    setFiles,
    setFilesLoading,
    conversation,
  });

  if (items.length === 0 && files.size === 0) {
    return null;
  }

  return (
    <div
      role="list"
      aria-label={localize('com_ui_composer_staged_context')}
      data-testid="composer-tray"
      className="flex flex-col gap-1.5 px-2 pt-2"
    >
      <FileRow
        files={files}
        setFiles={setFiles}
        isRTL={isRTL}
        abortUpload={abortUpload}
        setFilesLoading={setFilesLoading}
      />
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <ItemChip key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(Tray);
