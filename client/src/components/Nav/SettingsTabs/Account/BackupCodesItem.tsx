import React, { useState } from 'react';
import {
  OGDialog,
  OGDialogContent,
  OGDialogHeader,
  OGDialogTitle,
  OGDialogTrigger,
  Button,
  Label,
  Spinner,
} from '~/components';
import { RefreshCcw } from 'lucide-react';
import { useAuthContext, useLocalize } from '~/hooks';
import { useRegenerateBackupCodesMutation } from 'librechat-data-provider/react-query';
import { useToastContext } from '~/Providers';
import HoverCardSettings from '~/components/Nav/SettingsTabs/HoverCardSettings';
import { TBackupCode, TRegenerateBackupCodesResponse, type TUser } from 'librechat-data-provider';
import { useSetRecoilState } from 'recoil';
import store from '~/store';

const BackupCodesItem: React.FC = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const setUser = useSetRecoilState(store.user);
  const { showToast } = useToastContext();

  // Control the dialog open state.
  const [isDialogOpen, setDialogOpen] = useState<boolean>(false);

  const { mutate: regenerateBackupCodes, isLoading } = useRegenerateBackupCodesMutation();

  // Regenerate backup codes, update user state, and automatically download the backup codes file.
  const handleRegenerate = () => {
    regenerateBackupCodes(undefined, {
      onSuccess: (data: TRegenerateBackupCodesResponse) => {
        // Convert each code hash into a TBackupCode object.
        const newBackupCodes: TBackupCode[] = data.backupCodesHash.map((codeHash) => ({
          codeHash,
          used: false,
          usedAt: null,
        }));

        // Update the user state with the new backup codes.
        setUser((prev) => ({ ...prev, backupCodes: newBackupCodes } as TUser));
        showToast({ message: localize('com_ui_backup_codes_regenerated') });

        // Automatically download the backup codes as a plain text file.
        if (newBackupCodes.length) {
          const codesString = data.backupCodes.map((code) => code).join('\n');
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

  // Only render if two-factor authentication is enabled.
  if (!user?.totpEnabled) {
    return null;
  }

  return (
    <OGDialog open={isDialogOpen} onOpenChange={setDialogOpen}>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_ui_backup_codes')}</Label>
          <HoverCardSettings side="bottom" text="com_nav_info_2fa" />
        </div>
        <OGDialogTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            {localize('com_ui_backup_codes')}
          </Button>
        </OGDialogTrigger>
      </div>

      <OGDialogContent className="w-11/12 max-w-md">
        <OGDialogHeader>
          <OGDialogTitle className="mb-4 text-xl font-semibold">
            {localize('com_ui_backup_codes')}
          </OGDialogTitle>
        </OGDialogHeader>
        <div className="mt-4">
          {user.backupCodes?.length ? (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-secondary p-4 font-mono text-sm">
                {user.backupCodes.map((code, index) => {
                  // Determine the backup code state text.
                  const stateText = code.used ? localize('com_ui_used') : localize('com_ui_not_used');

                  // Conditional styling:
                  // - Used codes get red tones.
                  // - Unused codes get green tones.
                  const bgClass = code.used ? 'bg-red-100' : 'bg-green-100';
                  const borderClass = code.used ? 'border-red-400' : 'border-green-400';
                  const textClass = code.used ? 'text-red-700' : 'text-green-700';

                  return (
                    <div
                      key={code.codeHash}
                      className={`flex flex-col rounded-lg border p-2 ${bgClass} ${borderClass}`}
                    >
                      <div className="flex items-center space-x-2">
                        <span className="select-none text-xs text-text-secondary">
                          #{index + 1}
                        </span>
                        <span className={`font-medium tracking-wider ${textClass}`}>
                          {stateText}
                        </span>
                      </div>
                      {code.used && code.usedAt && (
                        <div className="mt-1 ml-6 text-xs text-gray-600">
                          {new Date(code.usedAt).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex gap-2 mt-3">
                <Button onClick={handleRegenerate} disabled={isLoading} className="flex-1 gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  {isLoading
                    ? localize('com_ui_regenerating')
                    : localize('com_ui_regenerate_backup')}
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-text-secondary">{localize('com_ui_no_backup_codes')}</p>
              <Button onClick={handleRegenerate} disabled={isLoading} className="flex gap-2 items-center">
                {isLoading && <Spinner className="mr-2" />}
                {localize('com_ui_generate_backup')}
              </Button>
            </div>
          )}
        </div>
      </OGDialogContent>
    </OGDialog>
  );
};

export default React.memo(BackupCodesItem);