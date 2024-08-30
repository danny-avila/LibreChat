
import React, { useEffect, useState } from 'react';
import { useGerUsersQuery } from '~/data-provider';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '~/components/ui';
import EditBalance from './EditBalance';
import CreatUser from './CreatUser';
import DeleteButton from './DeleteButton';
import { NewChatIcon } from '~/components/svg';
import { formatDate } from '~/utils';
import { TUser } from 'librechat-data-provider';
import useLocalize from '~/hooks/useLocalize';

export default function Account() {

  const localize = useLocalize();

  const [currentPage, setCurrentPage] = useState(1);
  const [currentUser, setCurrentUser] = useState<TUser | undefined>(undefined);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showBalanceDialog, setShowBalanceDialog] = useState(false);
  const [showCreatUserDialog, setShowCreatUserDialog] = useState(false);
  const [searchKey, setSearchKey] = useState('');
  const pageSize = 10; // 每页的用户数

  const { data: { list: users = [], pages = 0, count: totalUsers = 0 } = {}, refetch } = useGerUsersQuery({
    pageNumber: currentPage,
    pageSize: pageSize,
    searchKey: searchKey,
  });

  useEffect(() => {
    refetch();
  }, [currentPage, searchKey, refetch]);

  const handleSearchKeyChange = (e) => {
    setCurrentPage(1);
    setSearchKey(e.target.value);
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1);
    }
  };
  const handleNextPage = () => {
    if (currentPage < Number(pages)) {
      setCurrentPage((prev) => prev + 1);
    }
  };

  const haldlePreDeleteUser = (user) => {
    setCurrentUser(user);
    setShowDeleteDialog(true);
  };

  const handlePreEditBalance = (user) => {
    setCurrentUser(user);
    setShowBalanceDialog(true);
  };

  const handlePreCreatUser = (user?: TUser) => {
    setCurrentUser(user);
    setShowCreatUserDialog(true);
  };

  const handleRefreshList = () => {
    refetch();
  };

  return (
    <>
      <div className='flex items-center'>
        <Input
          placeholder='请输入用户名或邮箱筛选'
          value={(searchKey as string | undefined) ?? ''}
          onChange={handleSearchKeyChange}
          className="max-w-sm mb-5 mt-5 mr-5 border-border-medium placeholder:text-text-secondary"
        />

        <Button
          className="transform select-none border-border-medium ml-4"
          variant="outline"
          onClick={() => handlePreCreatUser()}
        >
          + 创建新用户
        </Button>
      </div>
      <div className="relative max-h-[25rem] min-h-[630px] overflow-y-auto rounded-md border border-black/10 pb-4 dark:border-white/10">

        <Table className="w-full min-w-[600px] border-separate border-spacing-0">
          <TableHeader>
            <TableRow>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                姓名
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                用户名
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                邮箱
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                Balance
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                角色
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                创建时间
              </TableHead>
              <TableHead
                className="align-start sticky top-0 rounded-t border-b border-black/10 bg-white px-2 py-1 text-left font-medium text-gray-700 dark:border-white/10 dark:bg-gray-700 dark:text-gray-100 sm:px-4 sm:py-2"
              >
                操作
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
                    {row.name}
                  </TableCell>
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

                    <button
                      className="text-token-text-primary flex"
                      onClick={() => handlePreEditBalance(row)}
                    >
                      <div className='min-w-[150px] text-left'> {row.tokenCredits}</div>
                      <NewChatIcon className="size-5" />
                    </button>

                  </TableCell>
                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    {row.role === 'ADMIN' ? '管理员' : '普通用户'}
                  </TableCell>
                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    {formatDate(row.createdAt)}
                  </TableCell>

                  <TableCell
                    className="align-start overflow-x-auto px-2 py-1 text-xs sm:px-4 sm:py-2 sm:text-sm [tr[data-disabled=true]_&]:opacity-50"
                  >
                    <Button onClick={() => haldlePreDeleteUser(row)} className='bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white'>删除</Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {localize('com_files_no_results')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="ml-4 mr-4 mt-4 flex h-auto items-center justify-end space-x-2 py-4 sm:ml-0 sm:mr-0 sm:h-0">
        <div className="text-muted-foreground ml-2 flex-1 text-sm">
          {
            `共${totalUsers}个用户`
          }
        </div>
        <Button
          className="select-none border-border-medium"
          variant="outline"
          size="sm"
          onClick={() => handlePreviousPage()}
          disabled={currentPage === 1}
        >
          上一页
        </Button>
        <Button
          className="select-none border-border-medium"
          variant="outline"
          size="sm"
          onClick={() => handleNextPage()}
          disabled={currentPage === pages}
        >
          下一页
        </Button>
      </div>

      {showDeleteDialog && (
        <DeleteButton
          user={currentUser}
          showDialog={showDeleteDialog}
          setShowDialog={setShowDeleteDialog}
          onConfirm={handleRefreshList}
        />
      )}
      {showBalanceDialog && (
        <EditBalance
          user={currentUser}
          showDialog={showBalanceDialog}
          setShowDialog={setShowBalanceDialog}
          onConfirm={handleRefreshList}
        />
      )}
      {showCreatUserDialog && (
        <CreatUser
          showDialog={showCreatUserDialog}
          setShowDialog={setShowCreatUserDialog}
          onConfirm={handleRefreshList}
        />
      )}
    </>
  );
}
