import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { REGEXP_ONLY_DIGITS, REGEXP_ONLY_DIGITS_AND_CHARS } from 'input-otp';
import { Button, InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator } from '~/components';
import { useLocalize } from '~/hooks';

const fadeAnimation = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.2 },
};

interface DisablePhaseProps {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  onDisable: (token: string, useBackup: boolean) => void;
  isDisabling: boolean;
}

export const DisablePhase: React.FC<DisablePhaseProps> = ({ onDisable, isDisabling }) => {
  const localize = useLocalize();
  const [token, setToken] = useState('');
  const [useBackup, setUseBackup] = useState(false);

  return (
    <motion.div {...fadeAnimation} className="space-y-8">
      <div className="flex justify-center">
        <InputOTP
          value={token}
          onChange={setToken}
          maxLength={useBackup ? 8 : 6}
          pattern={useBackup ? REGEXP_ONLY_DIGITS_AND_CHARS : REGEXP_ONLY_DIGITS}
          className="gap-2"
        >
          {useBackup ? (
            <InputOTPGroup>
              {Array.from({ length: 8 }).map((_, i) => (
                <InputOTPSlot key={i} index={i} />
              ))}
            </InputOTPGroup>
          ) : (
            <>
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
              </InputOTPGroup>
              <InputOTPSeparator />
              <InputOTPGroup>
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </>
          )}
        </InputOTP>
      </div>
      <Button
        variant="destructive"
        onClick={() => onDisable(token, useBackup)}
        disabled={isDisabling || token.length !== (useBackup ? 8 : 6)}
        className="w-full rounded-xl px-6 py-3 transition-all disabled:opacity-50"
      >
        {localize('com_ui_2fa_disable')}
      </Button>
      <button
        onClick={() => setUseBackup(!useBackup)}
        className="text-sm text-primary hover:underline"
      >
        {useBackup ? localize('com_ui_use_2fa_code') : localize('com_ui_use_backup_code')}
      </button>
    </motion.div>
  );
};
