import React, { useState } from 'react';
import { cn } from '~/utils';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { Dialog } from '~/components/ui/';
import { BookOpen, ChevronDown } from 'lucide-react';
import SelectMenuWithSupport from '~/components/ui/SelectMenuWithSupport';
import axios from 'axios';

interface Prompt {
  id: number;
  open: boolean;
  presetId?: null;
  title: string;
  chatGptLabel: string;
  endpoint: string; //"openAI"
  model: string; //"gpt-4-0613"
  frequency_penalty: number;
  jailbreak: boolean;
  tags: string[];
  presence_penalty: number;
  promptPrefix: string;
  temperature: number;
  top_p: number;
}

const loadLibrary = await axios({
  method: 'get',
  url: '/api/promptLibrary',
  withCredentials: true,
});

function PromptLibrary({ onSelect }) {
  const [importedLibrary] = useState(loadLibrary.data);
  const [promptLibrary, setPromptLibrary] = useState(importedLibrary);
  // const allTags = [...new Set(importedLibrary.flatMap(prompt => prompt.tags))];

  const handleLibraryToggle = (id) => {
    setPromptLibrary((prevState) =>
      prevState.map((prompt) => (prompt.id === id ? { ...prompt, open: !prompt.open } : prompt)),
    );
  };
  const [selectedTag, setSelectedTag] = useState('All');

  // const handleTagChange = (event) => {
  //     setSelectedTag(event.target.value);
  // };

  const filteredPrompts =
    selectedTag === 'All'
      ? promptLibrary
      : promptLibrary.filter((prompt) => prompt.tags.includes(selectedTag));

  const [open, setOpen] = useState(false);

  const availableOptions = [
    { title: 'Default', description: 'Default LibreChat prompts.', current: true },
    { title: 'Custom', description: 'Prompts shared by my site admin.', current: false },
  ];

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="mr-1 flex h-[32px] h-auto cursor-pointer  items-center rounded bg-transparent px-2 py-1 text-xs font-medium font-normal text-gray-600 transition-colors hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
      >
        <BookOpen className="mr-1 flex w-[22px] items-center stroke-1" />
        Library
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTemplate
          title={
            <div className="mb-4 mr-6 flex flex-row items-center justify-between">
              <h2>Prompt Library</h2>
              <div className="flex flex-row items-center justify-end gap-x-4">
                <p className="text-sm text-white">Filter by:</p>

                <SelectMenuWithSupport availableOptions={availableOptions} />
              </div>
            </div>
          }
          className="max-w-2xl"
          main={
            <div className="p-4">
              <ul
                role="list"
                className="
                                    divide-y divide-gray-100 overflow-hidden bg-white shadow-sm ring-1
                                    ring-gray-800/5 dark:divide-gray-900
                                    dark:bg-gray-800 dark:ring-gray-800/10 dark:ring-offset-gray-800/10 sm:rounded-md
                                "
              >
                {filteredPrompts.map((prompt) => (
                  <li key={prompt.id} className="flex gap-x-4">
                    <div className="flex-auto">
                      <div className="flex items-baseline justify-between gap-x-4">
                        <a
                          className="text-md flex w-full cursor-pointer flex-row justify-between p-4 font-semibold leading-6 text-gray-900 dark:text-white"
                          onClick={() => handleLibraryToggle(prompt.id)}
                        >
                          <span>{prompt.title}</span>
                          <ChevronDown className={cn(prompt.open ? 'rotate-180 transform' : '')} />
                        </a>
                      </div>
                      <div className={cn(prompt.open ? '' : 'hidden')}>
                        <p
                          className={cn(
                            'mt-1 px-4 pt-0 text-sm leading-6 text-gray-600 dark:text-gray-50',
                          )}
                        >
                          {prompt.promptPrefix}
                        </p>
                        <div className="flex flex-row justify-end p-4">
                          <button
                            className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium dark:text-white"
                            onClick={() => onSelect(prompt)}
                          >
                            Use Prompt
                          </button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      </Dialog>
    </div>
  );
}

export default PromptLibrary;
