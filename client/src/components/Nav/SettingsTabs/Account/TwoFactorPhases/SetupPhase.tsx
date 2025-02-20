import React from 'react';
import { QrCode } from 'lucide-react';
import { motion } from 'framer-motion';
import { Button, Spinner } from '~/components';
import { useLocalize } from '~/hooks';

const fadeAnimation = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.2 },
};

interface SetupPhaseProps {
  onNext: () => void;
  onError: (error: Error) => void;
  isGenerating: boolean;
  onGenerate: () => void;
}

export const SetupPhase: React.FC<SetupPhaseProps> = ({ isGenerating, onGenerate, onNext }) => {
  const localize = useLocalize();

  return (
    <motion.div {...fadeAnimation} className="space-y-6">
      <div className="rounded-xl bg-surface-secondary p-6">
        <h3 className="mb-4 flex justify-center text-lg font-medium">
          {localize('com_ui_2fa_account_security')}
        </h3>
        <Button
          variant="default"
          onClick={onGenerate}
          className="flex w-full"
          disabled={isGenerating}
        >
          {isGenerating ? <Spinner className="size-5" /> : <QrCode className="size-5" />}
          {isGenerating ? localize('com_ui_generating') : localize('com_ui_generate_qrcode')}
        </Button>
      </div>
    </motion.div>
  );
};
