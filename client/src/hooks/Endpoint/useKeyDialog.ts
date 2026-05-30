import { useState, useCallback, useMemo } from 'react';
import { EModelEndpoint } from 'librechat-data-provider';

export const useKeyDialog = () => {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyDialogEndpoint, setKeyDialogEndpoint] = useState<EModelEndpoint | null>(null);

  const handleOpenKeyDialog = useCallback(
    (ep: EModelEndpoint, e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setKeyDialogEndpoint(ep);
      setKeyDialogOpen(true);
    },
    [],
  );

  const onOpenChange = useCallback(
    (open: boolean) => {
      if (!open && keyDialogEndpoint) {
        const button = document.getElementById(`endpoint-${keyDialogEndpoint}-settings`);
        if (button) {
          setTimeout(() => {
            button.focus();
          }, 5);
        }
      }
      setKeyDialogOpen(open);
    },
    [keyDialogEndpoint],
  );

  return useMemo(
    () => ({
      keyDialogOpen,
      keyDialogEndpoint,
      onOpenChange,
      handleOpenKeyDialog,
    }),
    [keyDialogOpen, keyDialogEndpoint, onOpenChange, handleOpenKeyDialog],
  );
};

export default useKeyDialog;
