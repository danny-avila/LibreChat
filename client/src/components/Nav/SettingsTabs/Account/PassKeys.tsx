import React, { useState } from 'react';
import { Button, Label } from '~/components/ui';
import { OGDialog, OGDialogContent, OGDialogHeader, OGDialogTitle } from '~/components';
import { useLocalize } from '~/hooks';
import { useAuthContext } from '~/hooks/AuthContext';
import type { TPasskey } from 'librechat-data-provider';

export default function PassKeys() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const [isPasskeyModalOpen, setPasskeyModalOpen] = useState(false);

  if (!user?.passkeys?.length) {
    return null; // Don't render if no passkeys
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Label className="font-light">{localize('com_nav_passkeys')}</Label>
        </div>
        <Button
          variant="secondary"
          onClick={() => setPasskeyModalOpen(true)}
          className="ml-4 transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
        >
          {localize('com_nav_view_passkeys')}
        </Button>
      </div>

      {/* Passkey Modal */}
      <OGDialog open={isPasskeyModalOpen} onOpenChange={setPasskeyModalOpen}>
        <OGDialogContent className="w-11/12 max-w-lg">
          <OGDialogHeader>
            <OGDialogTitle className="text-lg font-medium leading-6">
              {localize('com_nav_passkeys')}
            </OGDialogTitle>
          </OGDialogHeader>
          <div className="mt-4 space-y-4">
            {user.passkeys.map((passkey: TPasskey) => (
              <div key={passkey.id} className="rounded-lg border p-3 bg-gray-50 dark:bg-gray-800">
                <p className="text-sm">
                  <strong>ID:</strong> {passkey.id}
                </p>
                <p className="text-sm break-all">
                  <strong>Public Key:</strong> {Buffer.from(passkey.publicKey).toString('base64')}
                </p>
                <p className="text-sm">
                  <strong>Usage Counter:</strong> {passkey.counter}
                </p>
                <p className="text-sm">
                  <strong>Transports:</strong> {passkey.transports.length > 0 ? passkey.transports.join(', ') : 'None'}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-end">
            <Button
              variant="default"
              onClick={() => setPasskeyModalOpen(false)}
              className="transition-colors duration-200 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {localize('com_ui_close')}
            </Button>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}