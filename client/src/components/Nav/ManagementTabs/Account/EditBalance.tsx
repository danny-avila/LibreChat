import React, { useCallback, useState, useEffect } from 'react';
import { useUpdateBalanceMutation } from '~/data-provider';
import {
  OGDialog,
  OGDialogTrigger,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Input,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { TrashIcon } from '~/components/svg';
import type { TUser } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';

type DeleteButtonProps = {
  user: TUser | null;
  className?: string;
  showBalanceDialog?: boolean;
  setShowBalanceDialog?: (value: boolean) => void;
  onConfirm: () => void;
};

export default function DeleteButton({
  user,
  className = '',
  showBalanceDialog,
  setShowBalanceDialog,
  onConfirm,
}: DeleteButtonProps) {

  const { showToast } = useToastContext();
  const [newBalance, setNewBalance] = useState('');

  useEffect(() => {
    console.log(user);
    if (user) {
      setNewBalance(user.tokenCredits !== undefined ? user.tokenCredits.toString() : '');
    }
  }, [user]);

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('balance变化', e.target.value);
    setNewBalance(e.target.value);
  };

  const { mutate: updateBalance, isLoading: isDeleting } = useUpdateBalanceMutation({
    onSuccess: () => {
      showToast({ message: '更新余额成功！' });
      onConfirm();
    },
    onError: (error) => {
      console.error('Error:', error);
      showToast({ message: '更新余额失败！', status: 'error' });
    },
  });

  const handleConfirm = () => {
    if (user) {
      console.log(user);
      const newValue = Number(newBalance);
      if (user.tokenCredits !== undefined && user.tokenCredits !== newValue) {
        updateBalance({
          id: user.id,
          balance: newValue,
        });
      } else {
        console.log('不用更新');
      }
    }
  };

  const dialogContent = (
    <OGDialogTemplate
      showCloseButton={false}
      title='编辑余额'
      className="z-[1000] max-w-[450px]"
      main={
        <>
          <div className="flex w-full flex-col items-center gap-2">
            <div className="grid w-full items-center gap-2">
              <Input
                value={(newBalance as string | undefined) ?? ''}
                onChange={handleBalanceChange}
                className='flex h-10 max-h-10 w-full resize-none px-3 py-2'
              />
            </div>
          </div>
        </>
      }
      selection={{
        selectHandler: handleConfirm,
        selectClasses:
          'bg-red-700 dark:bg-red-600 hover:bg-red-800 dark:hover:bg-red-800 text-white',
        selectText: '保存',
      }}
    />
  );

  return (
    <OGDialog open={showBalanceDialog} onOpenChange={setShowBalanceDialog}>
      {dialogContent}
    </OGDialog>
  );
}
