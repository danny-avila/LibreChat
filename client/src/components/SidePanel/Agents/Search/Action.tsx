import { useRef } from 'react';
import { Button } from '@librechat/client';
import { useFormContext } from 'react-hook-form';
import { KeyRound, CircleCheck } from 'lucide-react';
import { AuthType, AgentCapabilities } from 'librechat-data-provider';
import type { AgentForm } from '~/common';
import { useLocalize, useSearchApiKeyForm } from '~/hooks';
import ApiKeyDialog from './ApiKeyDialog';

export default function Action({
  authTypes = [],
  isToolAuthenticated = false,
}: {
  authTypes?: [string, AuthType][];
  isToolAuthenticated?: boolean;
}) {
  const localize = useLocalize();
  const { setValue } = useFormContext<AgentForm>();
  const apiKeyButtonRef = useRef<HTMLButtonElement>(null);
  const {
    onSubmit,
    isDialogOpen,
    setIsDialogOpen,
    handleRevokeApiKey,
    methods: keyFormMethods,
  } = useSearchApiKeyForm({
    onSubmit: () => {
      setValue(AgentCapabilities.web_search, true, { shouldDirty: true });
      setTimeout(() => apiKeyButtonRef.current?.focus(), 100);
    },
    onRevoke: () => {
      setValue(AgentCapabilities.web_search, false, { shouldDirty: true });
      setTimeout(() => apiKeyButtonRef.current?.focus(), 100);
    },
  });

  const isUserProvided = authTypes?.some(([, authType]) => authType === AuthType.USER_PROVIDED);

  if (!isUserProvided) {
    return null;
  }

  return (
    <>
      <Button
        ref={apiKeyButtonRef}
        type="button"
        variant="outline"
        onClick={() => setIsDialogOpen(true)}
        aria-haspopup="dialog"
        className="w-full justify-center gap-2"
      >
        {isToolAuthenticated ? (
          <CircleCheck className="h-4 w-4 text-green-500" aria-hidden="true" />
        ) : (
          <KeyRound className="h-4 w-4" aria-hidden="true" />
        )}
        {localize(
          isToolAuthenticated
            ? 'com_ui_manage_web_search_api_keys'
            : 'com_ui_add_web_search_api_keys',
        )}
      </Button>
      <ApiKeyDialog
        onSubmit={onSubmit}
        authTypes={authTypes}
        isOpen={isDialogOpen}
        onRevoke={handleRevokeApiKey}
        onOpenChange={setIsDialogOpen}
        register={keyFormMethods.register}
        isToolAuthenticated={isToolAuthenticated}
        handleSubmit={keyFormMethods.handleSubmit}
        triggerRef={apiKeyButtonRef}
      />
    </>
  );
}
