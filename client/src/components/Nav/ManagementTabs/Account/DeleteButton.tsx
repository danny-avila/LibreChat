import React, { useCallback } from 'react';
import { useDeleteUserByEmailMutation } from '~/data-provider';
import {
  OGDialog,
  Label,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import type { TUser } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';

type DeleteButtonProps = {
  user?: TUser;
  showDialog?: boolean;
  setShowDialog?: (value: boolean) => void;
  onConfirm: () => void;
};

export default function DeleteButton({
  user,
  showDialog,
  setShowDialog,
  onConfirm,
}: DeleteButtonProps) {

  const { showToast } = useToastContext();

  const { mutate: deleteUserByEmail, isLoading: isDeleting } = useDeleteUserByEmailMutation({
    onSuccess: () => {
      showToast({ message: '删除用户成功！' });
      onConfirm();
    },
    onError: (error) => {
      console.error('Error:', error);
      showToast({ message: '删除用户失败！', status: 'error' });
    },
  });

  const confirmDelete = useCallback(() => {
    if (user && !isDeleting) {
      deleteUserByEmail(user.email);
    }
  }, [user]);

  const dialogContent = (
    <OGDialogTemplate
      showCloseButton={false}
      title='删除用户？'
      className="z-[1000] max-w-[450px]"
      main={
        <>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Label htmlFor="dialog-confirm-delete" className="text-left text-sm font-medium">
                确定要删除用户: <strong>{user?.name}</strong>？其关联数据会被全部清空！
              </Label>
            </div>
          </div>
        </>
      }
      selection={{
        selectHandler: confirmDelete,
        selectClasses:
          'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
        selectText: '删除',
      }}
    />
  );

  return (
    <OGDialog open={showDialog} onOpenChange={setShowDialog}>
      {dialogContent}
    </OGDialog>
  );

}
