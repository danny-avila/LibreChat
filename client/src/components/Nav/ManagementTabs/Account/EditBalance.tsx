import React, { useState, useEffect } from 'react';
import { useUpdateBalanceMutation } from '~/data-provider';
import {
  OGDialog,
  Input,
} from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import type { TUser } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';

type EditBalanceProps = {
  user?: TUser;
  className?: string;
  showDialog?: boolean;
  setShowDialog?: (value: boolean) => void;
  onConfirm: () => void;
};

export default function EditBalance({
  user,
  showDialog,
  setShowDialog,
  onConfirm,
}: EditBalanceProps) {

  const { showToast } = useToastContext();
  const [newBalance, setNewBalance] = useState(0);
  const [equivalence, setEquivalence] = useState(0); // 等值美元

  useEffect(() => {
    console.log(user);
    if (user) {
      const credits = user.tokenCredits || 0;
      setNewBalance(credits);
      setEquivalence(credits / 100000);
    }
  }, [user]);

  const handleBalanceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const number = Number(e.target.value);
    setNewBalance(number);
    setEquivalence(number / 100000);
  };

  const { mutate: updateBalance, isLoading: isLoading } = useUpdateBalanceMutation({
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
    if (user && !isLoading) {
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
              <div className=' items-center'>
                <Input
                  value={(newBalance as number | undefined) ?? ''}
                  onChange={handleBalanceChange}
                  className='flex h-10 max-h-10 resize-none px-3 py-2'
                />
                <div className='min-w-[120px] pt-3'> ≈ {equivalence}美元</div>
              </div>
              <div className='text-red pt-6'>注意： 1000 个积分 = 0.001 美元</div>
            </div>
          </div>
        </>
      }
      selection={{
        selectHandler: handleConfirm,
        selectClasses:
          'rounded-md bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-550 focus:bg-green-550 focus:outline-none disabled:cursor-not-allowed disabled:hover:bg-green-500',
        selectText: '保存',
      }}
    />
  );

  return (
    <OGDialog open={showDialog} onOpenChange={setShowDialog}>
      {dialogContent}
    </OGDialog>
  );
}
