import filenamify from 'filenamify';
import { useEffect, useState } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { OGDialog, Button, Input, Label, Checkbox, Dropdown } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize, useExportConversation } from '~/hooks';

export default function ExportModal({
  open,
  onOpenChange,
  conversation,
  triggerRef,
  children,
}: {
  open: boolean;
  conversation: TConversation | null;
  onOpenChange: React.Dispatch<React.SetStateAction<boolean>>;
  triggerRef?: React.RefObject<HTMLButtonElement>;
  children?: React.ReactNode;
}) {
  const localize = useLocalize();

  const [filename, setFileName] = useState('');
  const [type, setType] = useState('Select a file type');

  const [includeOptions, setIncludeOptions] = useState<boolean | 'indeterminate'>(true);
  const [exportBranches, setExportBranches] = useState<boolean | 'indeterminate'>(false);
  const [recursive, setRecursive] = useState<boolean | 'indeterminate'>(true);

  const typeOptions = [
    { value: 'screenshot', label: 'screenshot (.png)' },
    { value: 'text', label: 'text (.txt)' },
    { value: 'markdown', label: 'markdown (.md)' },
    { value: 'json', label: 'json (.json)' },
    { value: 'csv', label: 'csv (.csv)' },
  ];

  useEffect(() => {
    if (!open && triggerRef && triggerRef.current) {
      triggerRef.current.focus();
    }
  }, [open, triggerRef]);

  useEffect(() => {
    setFileName(filenamify(String(conversation?.title ?? 'file')));
    setType('screenshot');
    setIncludeOptions(true);
    setExportBranches(false);
    setRecursive(true);
  }, [conversation?.title, open]);

  const _setType = (newType: string) => {
    const exportBranchesSupport = newType === 'json' || newType === 'csv' || newType === 'webpage';
    const exportOptionsSupport = newType !== 'csv' && newType !== 'screenshot';

    setExportBranches(exportBranchesSupport);
    setIncludeOptions(exportOptionsSupport);
    setType(newType);
  };

  const exportBranchesSupport = type === 'json' || type === 'csv' || type === 'webpage';
  const exportOptionsSupport = type !== 'csv' && type !== 'screenshot';

  const { exportConversation } = useExportConversation({
    conversation,
    filename,
    type,
    includeOptions,
    exportBranches,
    recursive,
  });

  return (
    <OGDialog open={open} onOpenChange={onOpenChange} triggerRef={triggerRef}>
      {children}
      <OGDialogTemplate
        title={localize('com_nav_export_conversation')}
        className="max-w-full sm:max-w-2xl"
        main={
          <div className="flex w-full flex-col items-center gap-6">
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <Label htmlFor="filename" className="text-left text-sm font-medium">
                  {localize('com_nav_export_filename')}
                </Label>
                <Input
                  id="filename"
                  value={filename}
                  onChange={(e) => setFileName(filenamify(e.target.value || ''))}
                  placeholder={localize('com_nav_export_filename_placeholder')}
                />
              </div>
              <div className="col-span-1 flex w-full flex-col items-start justify-start gap-2">
                <Label htmlFor="type" className="text-left text-sm font-medium">
                  {localize('com_nav_export_type')}
                </Label>
                <Dropdown value={type} onChange={_setType} options={typeOptions} portal={false} />
              </div>
            </div>
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="includeOptions" className="text-left text-sm font-medium">
                    {localize('com_nav_export_include_endpoint_options')}
                  </Label>
                  <div className="flex h-[40px] w-full items-center space-x-3">
                    <Checkbox
                      id="includeOptions"
                      disabled={!exportOptionsSupport}
                      checked={includeOptions}
                      className="focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
                      onCheckedChange={setIncludeOptions}
                    />
                    <label
                      htmlFor="includeOptions"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
                    >
                      {exportOptionsSupport
                        ? localize('com_nav_enabled')
                        : localize('com_nav_not_supported')}
                    </label>
                  </div>
                </div>
              </div>
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="exportBranches" className="text-left text-sm font-medium">
                  {localize('com_nav_export_all_message_branches')}
                </Label>
                <div className="flex h-[40px] w-full items-center space-x-3">
                  <Checkbox
                    id="exportBranches"
                    disabled={!exportBranchesSupport}
                    checked={exportBranches}
                    className="focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
                    onCheckedChange={setExportBranches}
                  />
                  <label
                    htmlFor="exportBranches"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
                  >
                    {exportBranchesSupport
                      ? localize('com_nav_enabled')
                      : localize('com_nav_not_supported')}
                  </label>
                </div>
              </div>
              {type === 'json' ? (
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="recursive" className="text-left text-sm font-medium">
                    {localize('com_nav_export_recursive_or_sequential')}
                  </Label>
                  <div className="flex h-[40px] w-full items-center space-x-3">
                    <Checkbox
                      id="recursive"
                      checked={recursive}
                      className="focus:ring-opacity-20 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:focus:ring-gray-600 dark:focus:ring-opacity-50 dark:focus:ring-offset-0"
                      onCheckedChange={setRecursive}
                    />
                    <label
                      htmlFor="recursive"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 dark:text-gray-50"
                    >
                      {localize('com_nav_export_recursive')}
                    </label>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        }
        buttons={
          <>
            <Button onClick={exportConversation} variant="submit">
              {localize('com_endpoint_export')}
            </Button>
          </>
        }
        selection={undefined}
      />
    </OGDialog>
  );
}
