import { FilePlusIcon } from '@radix-ui/react-icons';
import FileIcon from '~/components/svg/Files/FileIcon';
import { Button, FileUpload } from '~/components/ui';
import { useFileHandling } from '~/hooks';
import FileRow from './FileRow';
import { useChatContext } from '~/Providers';

export default function AttachFileModal({ lebel }: { lebel?: string }) {
  const { handleFileChange } = useFileHandling();
  const {
    ask,
    files,
    setFiles,
    conversation,
    isSubmitting,
    handleStopGenerating,
    filesLoading,
    setFilesLoading,
    recordingSate,
    recordedText,
    setRecordedText,
  } = useChatContext();

  return (
    <div>
      <FileUpload handleFileChange={handleFileChange} className="w-fit">
        <Button variant="outline" className="">
          <FilePlusIcon width={16} height={16} className="mr-2" />
          Select {lebel || 'File'}
        </Button>
      </FileUpload>
      <FileRow
        files={files}
        setFiles={setFiles}
        setFilesLoading={setFilesLoading}
        Wrapper={({ children }) => (
          <div className="mx-2 mt-2 flex flex-wrap gap-2 px-2.5 md:pl-0 md:pr-4">{children}</div>
        )}
      />
    </div>
  );
}
