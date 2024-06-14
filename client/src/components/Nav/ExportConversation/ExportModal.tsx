import filenamify from 'filenamify';
import { useEffect, useState } from 'react';
import type { TConversation } from 'librechat-data-provider';
import { Dialog, DialogButton, Input, Label, Checkbox, Dropdown } from '~/components/ui';
import { useLocalize, useExportConversation } from '~/hooks';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { cn, defaultTextProps } from '~/utils';

export default function ExportModal({
  open,
  onOpenChange,
  conversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: TConversation | null;
}) {
  const localize = useLocalize();

  const [filename, setFileName] = useState('');
  const [type, setType] = useState('Select a file type');

  const [includeOptions, setIncludeOptions] = useState<boolean | 'indeterminate'>(true);
  const [exportBranches, setExportBranches] = useState<boolean | 'indeterminate'>(false);
  const [recursive, setRecursive] = useState<boolean | 'indeterminate'>(true);

  const typeOptions = [
    { value: 'screenshot', display: 'screenshot (.png)' },
    { value: 'text', display: 'text (.txt)' },
    { value: 'markdown', display: 'markdown (.md)' },
    { value: 'json', display: 'json (.json)' },
    { value: 'csv', display: 'csv (.csv)' },
  ];

  useEffect(() => {
    setFileName(filenamify(String(conversation?.title || 'file')));
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
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
                  className={cn(
                    defaultTextProps,
                    'flex h-10 max-h-10 w-full resize-none px-3 py-2',
                  )}
                />
              </div>
              <div className="col-span-1 flex w-full flex-col items-start justify-start gap-2">
                <Label htmlFor="type" className="text-left text-sm font-medium">
                  {localize('com_nav_export_type')}
                </Label>
                <Dropdown value={type} onChange={_setType} options={typeOptions} />
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
            <DialogButton
              onClick={exportConversation}
              className="dark:hover:gray-400 border-gray-700 bg-green-500 text-white hover:bg-green-600 dark:hover:bg-green-600"
            >
              {localize('com_endpoint_export')}
            </DialogButton>
          </>
        }
        selection={undefined}
      />
    </Dialog>
  );
}
