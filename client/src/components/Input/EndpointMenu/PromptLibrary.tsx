import React, { useEffect, useState } from 'react';
import { cn } from '~/utils';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { Dialog } from '~/components/ui/';
import { BookOpen, SearchIcon } from 'lucide-react';
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
      className="mt-2 flex items-center justify-between bg-white px-4 py-3 dark:bg-gray-800 sm:px-6 md:rounded-md"
      aria-label="Pagination"
    >
      <div className="hidden sm:block">
        <p className="text-sm text-gray-700 dark:text-white">
          Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to{' '}
          <span className="font-medium">{Math.min(currentPage * itemsPerPage, items.length)}</span>{' '}
          of <span className="font-medium">{items.length}</span> results
        </p>
      </div>
      <div className="flex flex-1 justify-between sm:justify-end">
        <a
          onClick={() => (currentPage !== 1 ? handlePageChange(currentPage - 1) : null)}
          className={`relative inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-offset-0 ${
            currentPage === 1 ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          Previous
        </a>
        <a
          onClick={() => (currentPage !== maxPage ? handlePageChange(currentPage + 1) : null)}
          className={`relative ml-3 inline-flex items-center rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-offset-0 ${
            currentPage === maxPage ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          Next
        </a>
      </div>
    </nav>
  );
}

export function PromptLibrary({ onSelect }) {
  const prompts: Prompt[] = [];
  const [promptLibrary, setPromptLibrary] = useState(prompts);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;
  const [query, setQuery] = useState('');

  // TODO: Replace with meilisearch
  const filteredPrompts = promptLibrary.filter((prompt) => {
    const search = query.toLowerCase();
    return (
      // Search Title
      prompt.title.toLowerCase().includes(search) ||
      // Search Prompt
      prompt.promptPrefix.toLowerCase().includes(search) ||
      // Search Tags
      prompt.tags.some((tag) => tag.toLowerCase().includes(search))
    );
  });

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

  const paginatedPrompts = filteredPrompts.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

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
          className="max-h-[100vh] overflow-x-hidden overflow-y-scroll rounded-none sm:max-w-[95%] 2xl:max-w-[80%]"
          main={
            <div className="">
              <div className="pb-4">
                <div className="relative rounded-md bg-slate-200 dark:bg-gray-700">
                  <SearchIcon
                    className="pointer-events-none absolute left-4 top-3.5 h-5 w-5 text-gray-500"
                    aria-hidden="true"
                  />
                  <input
                    type="text"
                    className="h-12 w-full border-0 bg-transparent pl-11 pr-4 text-black outline-none dark:text-white sm:text-sm"
                    placeholder="Search..."
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>
              <ul
                role="list"
                className="
                  grid gap-1 shadow-sm sm:grid-cols-2 sm:gap-2
                  xl:grid-cols-4
                "
              >
                {paginatedPrompts.map((prompt) => (
                  <li
                    key={prompt.id}
                    className="flex gap-x-4 bg-slate-200 p-3 dark:bg-gray-800 sm:rounded-md"
                  >
                    <div className="flex-auto">
                      <div className="flex items-baseline justify-between gap-x-4 pb-1 sm:pb-3 sm:pt-1">
                        <a
                          className="text-md flex w-full cursor-pointer flex-row justify-between font-semibold leading-6 text-gray-900 dark:text-white"
                          onClick={() => handleLibraryToggle(prompt.id)}
                        >
                          <span>{prompt.title}</span>
                          <div className="flex flex-row gap-x-1">
                            {/*  loop and show all tags*/}
                            {prompt.tags.map((tag) => (
                              <span
                                key={tag}
                                className="inline-flex items-center gap-x-0.5 rounded-md bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </a>
                      </div>
                      <div>
                        <p
                          className={cn(
                            'text-sm leading-6 text-gray-600 dark:text-gray-200',
                            prompt.open
                              ? ''
                              : 'mb-1 line-clamp-2 sm:mb-3 xl:line-clamp-3 2xl:line-clamp-4',
                          )}
                        >
                          {prompt.promptPrefix}
                        </p>
                        <div className={cn('flex flex-row justify-end gap-x-4 pb-1 pt-2 sm:pb-2')}>
                          <button
                            className="rounded-md bg-slate-300 px-4 py-2 text-sm font-medium dark:bg-gray-600 dark:text-white"
                            onClick={() => handleLibraryToggle(prompt.id)}
                          >
                            {prompt.open ? 'View Less' : 'View More'}
                          </button>
                          <button
                            className="rounded-md bg-purple-400 px-4 py-2 text-sm font-medium text-white dark:bg-green-600 dark:text-white"
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
              <NavBar
                items={filteredPrompts}
                currentPage={currentPage}
                handlePageChange={setCurrentPage}
              />
            </div>
          }
        />
      </Dialog>
    </div>
  );
}
