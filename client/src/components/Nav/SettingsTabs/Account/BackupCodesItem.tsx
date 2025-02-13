import React, { useState } from 'react';
import { RefreshCcw, ShieldX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRegenerateBackupCodesMutation } from 'librechat-data-provider/react-query';
import { TBackupCode, TRegenerateBackupCodesResponse, type TUser } from 'librechat-data-provider';
import {
  OGDialog,
  OGDialogContent,
  OGDialogTitle,
  OGDialogTrigger,
  Button,
  Label,
  Spinner,
  TooltipAnchor,
} from '~/components';
import { useAuthContext, useLocalize } from '~/hooks';
import { useToastContext } from '~/Providers';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

const BackupCodesItem: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();
  const setUser = useSetRecoilState(store.user);
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);

  const { mutate: regenerateBackupCodes, isLoading } = useRegenerateBackupCodesMutation();

  const fetchBackupCodes = (auto: boolean = false) => {
    regenerateBackupCodes(undefined, {
      onSuccess: (data: TRegenerateBackupCodesResponse) => {
        const newBackupCodes: TBackupCode[] = data.backupCodesHash.map((codeHash) => ({
          codeHash,
          used: false,
          usedAt: null,
        }));

        setUser((prev) => ({ ...prev, backupCodes: newBackupCodes }) as TUser);
        showToast({
          message: localize('com_ui_backup_codes_regenerated'),
          status: 'success',
        });

        // Trigger file download only when user explicitly clicks the button.
        if (!auto && newBackupCodes.length) {
          const codesString = data.backupCodes.join('\n');
          const blob = new Blob([codesString], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'backup-codes.txt';
          a.click();
          URL.revokeObjectURL(url);
        }
      },
      onError: () =>
        showToast({
          message: localize('com_ui_backup_codes_regenerate_error'),
          status: 'error',
        }),
    });
  };

  const handleRegenerate = () => {
    fetchBackupCodes(false);
  };

  if (!user?.totpEnabled) {
    return null;
  }

  return (
    <OGDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Label className="font-light">{localize('com_ui_backup_codes')}</Label>
        </div>
        <OGDialogTrigger asChild>
          <Button aria-label="Show Backup Codes" variant="outline">
            {localize('com_ui_show')}
          </Button>
        </OGDialogTrigger>
      </div>

      <OGDialogContent className="w-11/12 max-w-lg">
        <OGDialogTitle className="mb-6 text-2xl font-semibold">
          {localize('com_ui_backup_codes')}
        </OGDialogTitle>

        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="mt-4"
          >
            {user.backupCodes?.length ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  {user.backupCodes.map((code, index) => {
                    const isUsed = code.used;
                    const description = `Backup code number ${index + 1}, ${
                      isUsed
                        ? `used on ${code.usedAt ? new Date(code.usedAt).toLocaleDateString() : 'an unknown date'}`
                        : 'not used yet'
                    }`;

                    return (
                      <motion.div
                        key={code.codeHash}
                        role="listitem"
                        tabIndex={0}
                        aria-label={description}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        onFocus={() => {
                          const announcement = new CustomEvent('announce', {
                            detail: { message: description },
                          });
                          document.dispatchEvent(announcement);
                        }}
                        className={`flex flex-col rounded-xl border p-4 backdrop-blur-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                          isUsed
                            ? 'border-red-200 bg-red-50/80 dark:border-red-800 dark:bg-red-900/20'
                            : 'border-green-200 bg-green-50/80 dark:border-green-800 dark:bg-green-900/20'
                        } `}
                      >
                        <div className="flex items-center justify-between" aria-hidden="true">
                          <span className="text-sm font-medium text-text-secondary">
                            #{index + 1}
                          </span>
                          <TooltipAnchor
                            description={
                              code.usedAt ? new Date(code.usedAt).toLocaleDateString() : ''
                            }
                            disabled={!isUsed}
                            focusable={false}
                            className={isUsed ? 'cursor-pointer' : 'cursor-default'}
                            render={
                              <span
                                className={`rounded-full px-3 py-1 text-sm font-medium ${
                                  isUsed
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                    : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                }`}
                              >
                                {isUsed ? localize('com_ui_used') : localize('com_ui_not_used')}
                              </span>
                            }
                          />
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                <div className="mt-12 flex justify-center">
                  <Button
                    onClick={handleRegenerate}
                    disabled={isLoading}
                    variant="default"
                    className="px-8 py-3 transition-all disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Spinner className="mr-2" />
                    ) : (
                      <RefreshCcw className="mr-2 h-4 w-4" />
                    )}
                    {isLoading
                      ? localize('com_ui_regenerating')
                      : localize('com_ui_regenerate_backup')}
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 p-6 text-center">
                <ShieldX className="h-12 w-12 text-text-primary" />
                <p className="text-lg text-text-secondary">{localize('com_ui_no_backup_codes')}</p>
                <Button
                  onClick={handleRegenerate}
                  disabled={isLoading}
                  variant="default"
                  className="px-8 py-3 transition-all disabled:opacity-50"
                >
                  {isLoading && <Spinner className="mr-2" />}
                  {localize('com_ui_generate_backup')}
                </Button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(BackupCodesItem);
