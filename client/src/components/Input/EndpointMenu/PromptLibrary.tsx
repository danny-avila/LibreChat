import React, {useEffect, useState} from 'react';
import { cn } from '~/utils';
import DialogTemplate from '~/components/ui/DialogTemplate';
// import { Dialog as ReactDialog, Disclosure, Menu, Popover, Transition } from '@headlessui/react'
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

function NavBar({ items, currentPage, handlePageChange }) {
  const itemsPerPage = 10;
  const maxPage = Math.ceil(items.length / itemsPerPage);

  return (
      <nav
          className="flex items-center justify-between mt-2 md:rounded-md bg-white dark:bg-gray-800 px-4 py-3 sm:px-6"
          aria-label="Pagination"
      >
        <div className="hidden sm:block">
          <p className="text-sm text-gray-700 dark:text-white">
            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, items.length)}</span> of{' '}
            <span className="font-medium">{items.length}</span> results
          </p>
        </div>
        <div className="flex flex-1 justify-between sm:justify-end">
          <a
              onClick={() => currentPage !== 1 ? handlePageChange(currentPage - 1) : null }
              className={`relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-offset-0 ${currentPage === 1 ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Previous
          </a>
          <a
              onClick={() => currentPage !== maxPage ? handlePageChange(currentPage + 1) : null}
              className={`relative ml-3 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-offset-0 ${currentPage === maxPage ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            Next
          </a>
        </div>
      </nav>
  )
}

export function PromptLibrary({ onSelect }) {
  const prompts: Prompt[] = [];
  const [promptLibrary, setPromptLibrary] = useState(prompts);
  // const allTags = [...new Set(promptLibrary.flatMap(prompt => prompt.tags))];
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Todo: move to state management
  useEffect(() => {
    axios({
      method: 'get',
      url: '/api/promptLibrary',
      withCredentials: true,
    }).then((res) => {
      setPromptLibrary(res.data);
    });
  }, []);

  const handleLibraryToggle = (id) => {
    setPromptLibrary((prevState) =>
      prevState.map((prompt) => (prompt.id === id ? { ...prompt, open: !prompt.open } : prompt)),
    );
  };
  const [selectedTag, setSelectedTag] = useState('All');

  // const handleTagChange = (event) => {
  //     setSelectedTag(event.target.value);
  // };
  const filters = [
    {
      id: 'tags',
      name: 'Tags',
      options: [
        { value: 'new-arrivals', label: 'All New Arrivals', checked: false },
        { value: 'tees', label: 'Tees', checked: false },
        { value: 'objects', label: 'Objects', checked: false },
      ],
    },
  ]

  const filteredPrompts =
    selectedTag === 'All'
      ? promptLibrary
      : promptLibrary.filter((prompt) => prompt.tags.includes(selectedTag));

  const paginatedPrompts = filteredPrompts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        onClick={() => setOpen(true)}
        className="mr-1 flex h-auto cursor-pointer items-center rounded bg-transparent px-2 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-slate-200 hover:text-red-700 dark:bg-transparent dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-green-500"
      >
        <BookOpen className="mr-1 flex w-[22px] items-center stroke-1" />
        Library
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTemplate
          title={
            <div className="mb-4 mr-6 flex flex-row items-center justify-between">
              <h2>Prompt Library</h2>
            </div>
          }
          className="sm:max-w-[95%] 2xl:max-w-[80%] rounded-none overflow-y-scroll overflow-x-hidden max-h-[100vh]"
          main={
            <div className="">
              <div className="pb-4">
                {/* Filters: just need to connect */}
                <form className="hidden mt-4 flex flex-row justify-end gap-3">
                  {filters.map((section) => (
                    <div>
                      <SelectMenuWithSupport section={section} />
                    </div>
                  ))}
                </form>

                <span className="inline-flex items-center gap-x-0.5 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                  Example
                  <button type="button" className="group relative -mr-1 h-3.5 w-3.5 rounded-sm hover:bg-gray-500/20">
                    <span className="sr-only">Remove</span>
                    <svg viewBox="0 0 14 14" className="h-3.5 w-3.5 stroke-gray-600/50 group-hover:stroke-gray-600/75">
                      <path d="M4 4l6 6m0-6l-6 6" />
                    </svg>
                    <span className="absolute -inset-1" />
                  </button>
                </span>
              </div>
              <ul
                role="list"
                className="
                  grid xl:grid-cols-4 gap-1 sm:gap-2 sm:grid-cols-2
                  shadow-sm
                "
              >
                {paginatedPrompts.map((prompt) => (
                  <li key={prompt.id} className="flex gap-x-4 bg-slate-200 dark:bg-gray-800 sm:rounded-md p-3">
                    <div className="flex-auto">
                      <div className="flex items-baseline justify-between gap-x-4 pb-1 sm:pb-3 sm:pt-1">
                        <a
                          className="text-md flex w-full cursor-pointer flex-row justify-between font-semibold leading-6 text-gray-900 dark:text-white"
                          onClick={() => handleLibraryToggle(prompt.id)}
                        >
                          <span>{prompt.title}</span>
                          <div>
                            {/*  loop and show all tags*/}
                            {prompt.tags.map((tag) => (
                                <span key={tag} className="inline-flex items-center gap-x-0.5 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                                  {tag}
                                </span>
                            ))}
                          </div>
                          {/*<ChevronDown className={cn(prompt.open ? 'rotate-180 transform' : '')} />*/}
                        </a>
                      </div>
                      <div>
                        <p
                          className={cn(
                            'text-sm leading-6 text-gray-600 dark:text-gray-200',
                              prompt.open ? '' : 'line-clamp-2 xl:line-clamp-3 2xl:line-clamp-4 mb-1 sm:mb-3'
                          )}
                        >
                          {prompt.promptPrefix}
                        </p>
                        <div className={cn(
                            "flex-row justify-end pt-2 pb-1 sm:pb-2 gap-x-4 flex"
                          )}>
                          <button
                            className="rounded-md bg-slate-300 dark:bg-gray-600 px-4 py-2 text-sm font-medium dark:text-white"
                            onClick={() => handleLibraryToggle(prompt.id)}
                          >
                            {prompt.open ? 'View Less' : 'View More'}
                          </button>
                          <button
                            className="rounded-md bg-purple-400 text-white dark:bg-green-600 px-4 py-2 text-sm font-medium dark:text-white"
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
              <NavBar items={filteredPrompts} currentPage={currentPage} handlePageChange={setCurrentPage} />
            </div>
          }
        />
      </Dialog>
    </div>
  );
}