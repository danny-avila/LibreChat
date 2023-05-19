import { useEffect, useState } from 'react';
import { useRecoilValue, useRecoilCallback } from 'recoil';
import filenamify from 'filenamify';
import exportFromJSON from 'export-from-json';
import download from 'downloadjs';
import DialogTemplate from '~/components/ui/DialogTemplate.jsx';
import { Dialog, DialogButton } from '~/components/ui/Dialog.tsx';
import { Input } from '~/components/ui/Input.tsx';
import { Label } from '~/components/ui/Label.tsx';
import { Checkbox } from '~/components/ui/Checkbox.tsx';
import Dropdown from '~/components/ui/Dropdown';
import { cn } from '~/utils/';
import { useScreenshot } from '~/utils/screenshotContext';

import store from '~/store';
import cleanupPreset from '~/utils/cleanupPreset.js';

export default function ExportModel({ open, onOpenChange }) {
  const { captureScreenshot } = useScreenshot();

  const [filename, setFileName] = useState('');
  const [type, setType] = useState('');

  const [includeOptions, setIncludeOptions] = useState(true);
  const [exportBranches, setExportBranches] = useState(false);
  const [recursive, setRecursive] = useState(true);

  const conversation = useRecoilValue(store.conversation) || {};
  const messagesTree = useRecoilValue(store.messagesTree) || [];
  const endpointsConfig = useRecoilValue(store.endpointsConfig);

  const getSiblingIdx = useRecoilCallback(
    ({ snapshot }) =>
      async (messageId) =>
        await snapshot.getPromise(store.messagesSiblingIdxFamily(messageId)),
    []
  );

  const typeOptions = [
    { value: 'screenshot', display: 'screenshot (.png)' },
    { value: 'text', display: 'text (.txt)' },
    { value: 'markdown', display: 'markdown (.md)' },
    { value: 'json', display: 'json (.json)' },
    { value: 'csv', display: 'csv (.csv)' }
  ]; //,, 'webpage'];

  useEffect(() => {
    setFileName(filenamify(String(conversation?.title || 'file')));
    setType('screenshot');
    setIncludeOptions(true);
    setExportBranches(false);
    setRecursive(true);
  }, [open]);

  const _setType = (newType) => {
    const exportBranchesSupport = newType === 'json' || newType === 'csv' || newType === 'webpage';
    const exportOptionsSupport = newType !== 'csv' && newType !== 'screenshot';

    setExportBranches(exportBranchesSupport);
    setIncludeOptions(exportOptionsSupport);
    setType(newType);
  };

  const exportBranchesSupport = type === 'json' || type === 'csv' || type === 'webpage';
  const exportOptionsSupport = type !== 'csv' && type !== 'screenshot';

  // return an object or an array based on branches and recursive option
  // messageId is used to get siblindIdx from recoil snapshot
  const buildMessageTree = async ({
    messageId,
    message,
    messages,
    branches = false,
    recursive = false
  }) => {
    let children = [];
    if (messages?.length)
      if (branches)
        for (const message of messages)
          children.push(
            await buildMessageTree({
              messageId: message?.messageId,
              message: message,
              messages: message?.children,
              branches,
              recursive
            })
          );
      else {
        let message = messages[0];
        if (messages?.length > 1) {
          const siblingIdx = await getSiblingIdx(messageId);
          message = messages[messages.length - siblingIdx - 1];
        }

        children = [
          await buildMessageTree({
            messageId: message?.messageId,
            message: message,
            messages: message?.children,
            branches,
            recursive
          })
        ];
      }

    if (recursive) return { ...message, children: children };
    else {
      let ret = [];
      if (message) {
        let _message = { ...message };
        delete _message.children;
        ret = [_message];
      }
      for (const child of children) ret = ret.concat(child);
      return ret;
    }
  };

  const exportScreenshot = async () => {
    const data = await captureScreenshot();
    download(data, `${filename}.png`, 'image/png');
  };

  const exportCSV = async () => {
    let data = [];

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: messagesTree,
      branches: exportBranches,
      recursive: false
    });

    for (const message of messages) {
      data.push(message);
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'csv',
      exportType: exportFromJSON.types.csv,
      beforeTableEncode: (entries) => [
        {
          fieldName: 'sender',
          fieldValues: entries.find((e) => e.fieldName == 'sender').fieldValues
        },
        { fieldName: 'text', fieldValues: entries.find((e) => e.fieldName == 'text').fieldValues },
        {
          fieldName: 'isCreatedByUser',
          fieldValues: entries.find((e) => e.fieldName == 'isCreatedByUser').fieldValues
        },
        {
          fieldName: 'error',
          fieldValues: entries.find((e) => e.fieldName == 'error').fieldValues
        },
        {
          fieldName: 'unfinished',
          fieldValues: entries.find((e) => e.fieldName == 'unfinished').fieldValues
        },
        {
          fieldName: 'cancelled',
          fieldValues: entries.find((e) => e.fieldName == 'cancelled').fieldValues
        },
        {
          fieldName: 'messageId',
          fieldValues: entries.find((e) => e.fieldName == 'messageId').fieldValues
        },
        {
          fieldName: 'parentMessageId',
          fieldValues: entries.find((e) => e.fieldName == 'parentMessageId').fieldValues
        },
        {
          fieldName: 'createdAt',
          fieldValues: entries.find((e) => e.fieldName == 'createdAt').fieldValues
        }
      ]
    });
  };

  const exportMarkdown = async () => {
    let data =
      `# Conversation\n` +
      `- conversationId: ${conversation?.conversationId}\n` +
      `- endpoint: ${conversation?.endpoint}\n` +
      `- title: ${conversation?.title}\n` +
      `- exportAt: ${new Date().toTimeString()}\n`;

    if (includeOptions) {
      data += `\n## Options\n`;
      const options = cleanupPreset({ preset: conversation, endpointsConfig });

      for (const key of Object.keys(options)) {
        data += `- ${key}: ${options[key]}\n`;
      }
    }

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: messagesTree,
      branches: false,
      recursive: false
    });

    data += `\n## History\n`;
    for (const message of messages) {
      data += `**${message?.sender}:**\n${message?.text}\n`;
      if (message.error) data += `*(This is an error message)*\n`;
      if (message.unfinished) data += `*(This is an unfinished message)*\n`;
      if (message.cancelled) data += `*(This is a cancelled message)*\n`;
      data += '\n\n';
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'md',
      exportType: exportFromJSON.types.text
    });
  };

  const exportText = async () => {
    let data =
      `Conversation\n` +
      `########################\n` +
      `conversationId: ${conversation?.conversationId}\n` +
      `endpoint: ${conversation?.endpoint}\n` +
      `title: ${conversation?.title}\n` +
      `exportAt: ${new Date().toTimeString()}\n`;

    if (includeOptions) {
      data += `\nOptions\n########################\n`;
      const options = cleanupPreset({ preset: conversation, endpointsConfig });

      for (const key of Object.keys(options)) {
        data += `${key}: ${options[key]}\n`;
      }
    }

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: messagesTree,
      branches: false,
      recursive: false
    });

    data += `\nHistory\n########################\n`;
    for (const message of messages) {
      data += `>> ${message?.sender}:\n${message?.text}\n`;
      if (message.error) data += `(This is an error message)\n`;
      if (message.unfinished) data += `(This is an unfinished message)\n`;
      if (message.cancelled) data += `(This is a cancelled message)\n`;
      data += '\n\n';
    }

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'txt',
      exportType: exportFromJSON.types.text
    });
  };

  const exportJSON = async () => {
    let data = {
      conversationId: conversation?.conversationId,
      endpoint: conversation?.endpoint,
      title: conversation?.title,
      exportAt: new Date().toTimeString(),
      branches: exportBranches,
      recursive: recursive
    };

    if (includeOptions) data.options = cleanupPreset({ preset: conversation, endpointsConfig });

    const messages = await buildMessageTree({
      messageId: conversation?.conversationId,
      message: null,
      messages: messagesTree,
      branches: exportBranches,
      recursive: recursive
    });

    if (recursive) data.messagesTree = messages.children;
    else data.messages = messages;

    exportFromJSON({
      data: data,
      fileName: filename,
      extension: 'json',
      exportType: exportFromJSON.types.json
    });
  };

  const exportConversation = () => {
    if (type === 'json') exportJSON();
    else if (type == 'text') exportText();
    else if (type == 'markdown') exportMarkdown();
    else if (type == 'csv') exportCSV();
    else if (type == 'screenshot') exportScreenshot();
  };

  const defaultTextProps =
    'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTemplate
        title="Export conversation"
        className="max-w-full sm:max-w-2xl"
        main={
          <div className="flex w-full flex-col items-center gap-6">
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <Label htmlFor="filename" className="text-left text-sm font-medium">
                  Filename
                </Label>
                <Input
                  id="filename"
                  value={filename}
                  onChange={(e) => setFileName(filenamify(e.target.value || ''))}
                  placeholder="Set the filename"
                  className={cn(
                    defaultTextProps,
                    'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                  )}
                />
              </div>
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <Label htmlFor="type" className="text-left text-sm font-medium">
                  Type
                </Label>
                <Dropdown
                  id="type"
                  value={type}
                  onChange={_setType}
                  options={typeOptions}
                  className={cn(
                    defaultTextProps,
                    'flex h-10 max-h-10 w-full resize-none focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                  )}
                  containerClassName="flex w-full resize-none"
                />
              </div>
            </div>
            <div className="grid w-full gap-6 sm:grid-cols-2">
              <div className="col-span-1 flex flex-col items-start justify-start gap-2">
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="includeOptions" className="text-left text-sm font-medium">
                    Include endpoint options
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
                      {exportOptionsSupport ? 'Enabled' : 'Not Supported'}
                    </label>
                  </div>
                </div>
              </div>
              <div className="grid w-full items-center gap-2">
                <Label htmlFor="exportBranches" className="text-left text-sm font-medium">
                  Export all message branches
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
                    {exportBranchesSupport ? 'Enabled' : 'Not Supported'}
                  </label>
                </div>
              </div>
              {type === 'json' ? (
                <div className="grid w-full items-center gap-2">
                  <Label htmlFor="recursive" className="text-left text-sm font-medium">
                    Recursive or sequential?
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
                      Recursive
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
              className="dark:hover:gray-400 border-gray-700 bg-green-600 text-white hover:bg-green-700 dark:hover:bg-green-800"
            >
              Export
            </DialogButton>
          </>
        }
        selection={null}
      />
    </Dialog>
  );
}
