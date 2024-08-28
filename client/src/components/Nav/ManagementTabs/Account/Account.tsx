
import { useGerUsersInfiniteQuery } from '~/data-provider';
import { useAuthContext } from '~/hooks';
import type { TUser } from 'librechat-data-provider';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Switch
} from '~/components/ui';

export default function Account() {
  const { isAuthenticated } = useAuthContext();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, refetch } =
    useGerUsersQuery(
      {
        pageNumber: 1,
        pageSize: 30,
      },
    );
  console.log('data', data);
  console.log('fetchNextPage', fetchNextPage);
  console.log('hasNextPage', hasNextPage);
  console.log('isFetchingNextPage', isFetchingNextPage);

  let users: TUser[] = []

  const toggleUserStatus = (value: boolean) => {
    console.log('切换用户状态', value);
  }

  const handlePreviousPage = () => {
    console.log('上一页');
  }
  const handleNextPage = () => {
    console.log('下一页');
  }

  return (
    <>
      <div className="relative max-h-[25rem] min-h-0 overflow-y-auto rounded-md border border-black/10 pb-4 dark:border-white/10 sm:min-h-[28rem]">
        <Table className="w-full min-w-[600px] border-separate border-spacing-0">
          <TableHeader>
            <TableRow>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Name
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Username
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Email
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Created At
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Operate
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length ? (
              users.map((row) => (
                <TableRow
                  key={row.id}
                  className="border-b border-black/10 text-left text-gray-600 dark:border-white/10 dark:text-gray-300 [tr:last-child_&]:border-b-0"
                >
                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    {row.username}
                  </TableCell>

                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    {row.email}
                  </TableCell>

                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    {row.createdAt}
                  </TableCell>

                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    <Switch
                      checked={row.status === 1 ?? true}
                      onCheckedChange={(checked: boolean) => toggleUserStatus(checked)}
                      className="flex"
                    />
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow className='flex items-center'>
                <TableCell colSpan={users.length} className="h-24 items-center">
                  暂无数据
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="ml-4 mr-4 mt-4 flex h-auto items-center justify-end space-x-2 py-4 sm:ml-0 sm:mr-0 sm:h-0">
        <div className="text-muted-foreground ml-2 flex-1 text-sm">
          {
            `共${10}个用户`
          }
        </div>
        <Button
          className="select-none border-border-medium"
          variant="outline"
          size="sm"
          onClick={() => handlePreviousPage()}
        // disabled={!table.getCanPreviousPage()}
        >
          上一页
        </Button>
        <Button
          className="select-none border-border-medium"
          variant="outline"
          size="sm"
          onClick={() => handleNextPage()}
        // disabled={!table.getCanNextPage()}
        >
          下一页
        </Button>
      </div>
    </>
  );
}
