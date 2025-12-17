import React, { useMemo, useCallback, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { TerminalSquareIcon } from 'lucide-react';
import { Tools, AuthType } from 'librechat-data-provider';
import { Spinner, useToastContext } from '@librechat/client';
import type { CodeBarProps } from '~/common';
import { useVerifyAgentToolAuth, useToolCallMutation } from '~/data-provider';
import ApiKeyDialog from '~/components/SidePanel/Agents/Code/ApiKeyDialog';
import { useLocalize, useCodeApiKeyForm } from '~/hooks';
import { useMessageContext } from '~/Providers';
import { cn, normalizeLanguage } from '~/utils';

const RunCode: React.FC<CodeBarProps> = React.memo(({ lang, codeRef, blockIndex }) => {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const execute = useToolCallMutation(Tools.execute_code, {
    onError: () => {
      showToast({ message: localize('com_ui_run_code_error'), status: 'error' });
    },
  });

  const { messageId, conversationId, partIndex } = useMessageContext();
  const normalizedLang = useMemo(() => normalizeLanguage(lang), [lang]);
  const { data } = useVerifyAgentToolAuth(
    { toolId: Tools.execute_code },
    {
      retry: 1,
    },
  );
  const authType = useMemo(() => data?.message ?? false, [data?.message]);
  const isAuthenticated = useMemo(() => data?.authenticated ?? false, [data?.authenticated]);
  const { methods, onSubmit, isDialogOpen, setIsDialogOpen, handleRevokeApiKey } =
    useCodeApiKeyForm({});

  const handleExecute = useCallback(async () => {
    if (!isAuthenticated) {
      setIsDialogOpen(true);
      return;
    }
    const codeString: string = codeRef.current?.textContent ?? '';
    if (
      typeof codeString !== 'string' ||
      codeString.length === 0 ||
      typeof normalizedLang !== 'string' ||
      normalizedLang.length === 0
    ) {
      return;
    }

    execute.mutate({
      partIndex,
      messageId,
      blockIndex,
      conversationId: conversationId ?? '',
      lang: normalizedLang,
      code: codeString,
    });
  }, [
    codeRef,
    execute,
    partIndex,
    messageId,
    blockIndex,
    conversationId,
    normalizedLang,
    setIsDialogOpen,
    isAuthenticated,
  ]);

  const debouncedExecute = useMemo(
    () => debounce(handleExecute, 1000, { leading: true }),
    [handleExecute],
  );

  useEffect(() => {
    return () => {
      debouncedExecute.cancel();
    };
  }, [debouncedExecute]);

  if (typeof normalizedLang !== 'string' || normalizedLang.length === 0) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={cn('ml-auto flex gap-2 rounded-sm focus:outline focus:outline-white')}
        onClick={debouncedExecute}
        disabled={execute.isLoading}
      >
        {execute.isLoading ? (
          <Spinner className="animate-spin" size={18} />
        ) : (
          <TerminalSquareIcon size={18} aria-hidden="true" />
        )}
        {localize('com_ui_run_code')}
      </button>
      <ApiKeyDialog
        onSubmit={onSubmit}
        isOpen={isDialogOpen}
        register={methods.register}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        handleSubmit={methods.handleSubmit}
        isToolAuthenticated={isAuthenticated}
        isUserProvided={authType === AuthType.USER_PROVIDED}
      />
    </>
  );
});

export default RunCode;
