import filenamify from 'filenamify';
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  OGDialogTemplate,
  OGDialog,
  Button,
  Input,
  Label,
  Checkbox,
  Dropdown,
} from '@librechat/client';
import type { TConversation } from 'librechat-data-provider';
import { useLocalize, useExportConversation } from '~/hooks';

const TYPE_OPTIONS = [
  { value: 'screenshot', label: 'screenshot (.png)' },
  { value: 'text', label: 'text (.txt)' },
  { value: 'markdown', label: 'markdown (.md)' },
  { value: 'json', label: 'json (.json)' },
  { value: 'csv', label: 'csv (.csv)' },
];

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
  const [type, setType] = useState<string>('screenshot');

  const [includeOptions, setIncludeOptions] = useState<boolean | 'indeterminate'>(true);
  const [exportBranches, setExportBranches] = useState<boolean | 'indeterminate'>(false);
  const [recursive, setRecursive] = useState<boolean | 'indeterminate'>(true);

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

  const handleTypeChange = useCallback((newType: string) => {
    const branches = newType === 'json' || newType === 'csv' || newType === 'webpage';
    const options = newType !== 'csv' && newType !== 'screenshot';
    setExportBranches(branches);
    setIncludeOptions(options);
    setType(newType);
  }, []);

  const exportBranchesSupport = useMemo(
    () => type === 'json' || type === 'csv' || type === 'webpage',
    [type],
  );
  const exportOptionsSupport = useMemo(() => type !== 'csv' && type !== 'screenshot', [type]);

  const { exportConversation } = useExportConversation({
    conversation,
    filename: filenamify(filename),
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
                  onChange={(e) => setFileName(e.target.value || '')}
                  placeholder={localize('com_nav_export_filename_placeholder')}
                />
              </div>
              <div className="col-span-1 flex w-full flex-col items-start justify-start gap-2">
                <Label htmlFor="type" className="text-left text-sm font-medium">
                  {localize('com_nav_export_type')}
                </Label>
                <Dropdown
                  value={type}
                  onChange={handleTypeChange}
                  options={TYPE_OPTIONS}
                  className="z-50"
                  portal={false}
                />
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
                    <Checkbox id="recursive" checked={recursive} onCheckedChange={setRecursive} />
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
