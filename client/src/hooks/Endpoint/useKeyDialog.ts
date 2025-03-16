import { useState, useCallback } from 'react';
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

  return {
    keyDialogOpen,
    keyDialogEndpoint,
    setKeyDialogOpen,
    handleOpenKeyDialog,
  };
};

export default useKeyDialog;
