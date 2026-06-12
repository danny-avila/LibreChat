import { useState, useCallback, useMemo } from 'react';

export const useKeyDialog = () => {
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [keyDialogEndpoint, setKeyDialogEndpoint] = useState<string | null>(null);

  const openKeyDialog = useCallback((ep: string) => {
    setKeyDialogEndpoint(ep);
    setKeyDialogOpen(true);
  }, []);

  const handleOpenKeyDialog = useCallback(
    (ep: string, e: React.MouseEvent | React.KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openKeyDialog(ep);
    },
    [openKeyDialog],
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
      openKeyDialog,
      handleOpenKeyDialog,
    }),
    [keyDialogOpen, keyDialogEndpoint, onOpenChange, openKeyDialog, handleOpenKeyDialog],
  );
};

export default useKeyDialog;
