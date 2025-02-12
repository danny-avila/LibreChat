import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePromptGroupsNav } from '~/hooks';
import PromptCard from './PromptCard';
import { Button } from '../ui';

export default function Prompts() {
  const { prevPage, nextPage, hasNextPage, promptGroups, hasPreviousPage, setPageSize, pageSize } =
    usePromptGroupsNav();

  const renderPromptCards = (start = 0, count) => {
    return promptGroups
      .slice(start, count + start)
      .map((promptGroup) => <PromptCard key={promptGroup._id} promptGroup={promptGroup} />);
  };

  const getRows = () => {
    switch (pageSize) {
      case 4:
        return [4];
      case 8:
        return [4, 4];
      case 12:
        return [4, 4, 4];
      default:
        return [];
    }
  };

  const rows = getRows();

  return (
    <div className="mx-3 flex h-full max-w-3xl flex-col items-stretch justify-center gap-4">
      <div className="mt-2 flex justify-end gap-2">
        <Button
          variant={'ghost'}
          onClick={() => setPageSize(4)}
          className={`rounded px-3 py-2 hover:bg-transparent ${
            pageSize === 4 ? 'text-white' : 'text-gray-500 dark:text-gray-500'
          }`}
        >
          4
        </Button>
        <Button
          variant={'ghost'}
          onClick={() => setPageSize(8)}
          className={`rounded px-3 py-2 hover:bg-transparent ${
            pageSize === 8 ? 'text-white' : 'text-gray-500 dark:text-gray-500'
          }`}
        >
          8
        </Button>
        <Button
          variant={'ghost'}
          onClick={() => setPageSize(12)}
          className={`rounded p-2 hover:bg-transparent ${
            pageSize === 12 ? 'text-white' : 'text-gray-500 dark:text-gray-500'
          }`}
        >
          12
        </Button>
      </div>
      <div className="flex h-full flex-col items-start gap-2">
        <div
          className={
            'flex min-h-[121.1px] min-w-full max-w-3xl flex-col gap-4 overflow-y-auto md:min-w-[22rem] lg:min-w-[43rem]'
          }
        >
          {rows.map((rowSize, index) => (
            <div key={index} className="flex flex-wrap justify-center gap-4">
              {renderPromptCards(rowSize * index, rowSize)}
            </div>
          ))}
        </div>
        <div className="flex w-full justify-between">
          <Button
            variant={'ghost'}
            onClick={prevPage}
            disabled={!hasPreviousPage}
            className="m-0 self-start p-0 hover:bg-transparent"
            aria-label="previous"
          >
            <ChevronLeft className={`${hasPreviousPage ? '' : 'text-gray-500'}`} />
          </Button>
          <Button
            variant={'ghost'}
            onClick={nextPage}
            disabled={!hasNextPage}
            className="m-0 self-end p-0 hover:bg-transparent"
          >
            <ChevronRight className={`${hasNextPage ? '' : 'text-gray-500'}`} />
          </Button>
        </div>
      </div>
    </div>
  );
}
