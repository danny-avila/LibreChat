// client/src/hooks/Plugins/useCodeApiKeyForm.ts
import { useRef, useState, useCallback } from 'react';
import { useForm } from 'react-hook-form';
import type { ApiKeyFormData } from '~/common';
import useAuthCodeTool from '~/hooks/Plugins/useAuthCodeTool';

export default function useCodeApiKeyForm({
  onSubmit,
  onRevoke,
}: {
  onSubmit?: () => void;
  onRevoke?: () => void;
}) {
  const methods = useForm<ApiKeyFormData>();
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const badgeTriggerRef = useRef<HTMLInputElement>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { installTool, removeTool } = useAuthCodeTool({ isEntityTool: true });
  const { reset } = methods;

  const onSubmitHandler = useCallback(
    (data: { apiKey: string }) => {
      reset();
      installTool(data.apiKey);
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
