import React from 'react';
import { motion } from 'framer-motion';
import { Download } from 'lucide-react';
import { Button, Label } from '@librechat/client';
import { useLocalize } from '~/hooks';

const fadeAnimation = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -20 },
  transition: { duration: 0.2 },
};

interface BackupPhaseProps {
  onNext: () => void;
  onError: (error: Error) => void;
  backupCodes: string[];
  onDownload: () => void;
  downloaded: boolean;
}

export const BackupPhase: React.FC<BackupPhaseProps> = ({
  backupCodes,
  onDownload,
  downloaded,
  onNext,
}) => {
  const localize = useLocalize();

  return (
    <motion.div {...fadeAnimation} className="space-y-6">
      <Label className="break-keep text-sm">{localize('com_ui_download_backup_tooltip')}</Label>
      <div className="grid grid-cols-2 gap-4 rounded-xl bg-surface-secondary p-6">
        {backupCodes.map((code, index) => (
          <motion.div
            key={code}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="rounded-lg bg-surface-tertiary p-3"
          >
            <div className="flex items-center justify-between">
              <span className="hidden text-sm text-text-secondary sm:inline">#{index + 1}</span>
              <span className="font-mono text-lg">{code}</span>
            </div>
          </motion.div>
        ))}
      </div>
      <div className="flex gap-4">
        <Button variant="outline" onClick={onDownload} className="flex-1 gap-2">
          <Download className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">{localize('com_ui_download_backup')}</span>
        </Button>
        <Button onClick={onNext} disabled={!downloaded} className="flex-1">
          {localize('com_ui_complete_setup')}
        </Button>
      </div>
    </motion.div>
  );
};
