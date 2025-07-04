import { useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import useAuthSearchTool from '~/hooks/Plugins/useAuthSearchTool';
import type { SearchApiKeyFormData } from '~/hooks/Plugins/useAuthSearchTool';

export default function useSearchApiKeyForm({
  onSubmit,
  onRevoke,
}: {
  onSubmit?: () => void;
  onRevoke?: () => void;
}) {
  const methods = useForm<SearchApiKeyFormData>();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const badgeTriggerRef = useRef<HTMLInputElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { installTool, removeTool } = useAuthSearchTool({ isEntityTool: true });
  const { reset } = methods;

  const onSubmitHandler = useCallback(
    (data: SearchApiKeyFormData) => {
      reset();
      installTool(data);
      setIsDialogOpen(false);
      onSubmit?.();
    },
    [onSubmit, reset, installTool],
  );

  const handleRevokeApiKey = useCallback(() => {
    reset();
    removeTool();
    setIsDialogOpen(false);
    onRevoke?.();
  }, [reset, onRevoke, removeTool]);

  return {
    methods,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    onSubmit: onSubmitHandler,
    badgeTriggerRef,
    menuTriggerRef,
  };
}
