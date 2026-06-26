import { FormProvider, useWatch } from 'react-hook-form';
import { Permissions, PermissionTypes } from 'librechat-data-provider';
import { useHasAccess } from '~/hooks';
import type { useMCPServerForm, MCPServerFormData } from './hooks/useMCPServerForm';
import { AuthTypeEnum } from './hooks/useMCPServerForm';
import ConnectionSection from './sections/ConnectionSection';
import BasicInfoSection from './sections/BasicInfoSection';
import TransportSection from './sections/TransportSection';
import TrustSection from './sections/TrustSection';
import AuthSection from './sections/AuthSection';

interface MCPServerFormProps {
  formHook: ReturnType<typeof useMCPServerForm>;
}

export default function MCPServerForm({ formHook }: MCPServerFormProps) {
  const { methods, isEditMode, server } = formHook;

  const canConfigureObo = useHasAccess({
    permissionType: PermissionTypes.MCP_SERVERS,
    permission: Permissions.CONFIGURE_OBO,
  });

  /**
   * Lockdown applies when a user without CONFIGURE_OBO opens an OBO server in
   * edit mode. Mirrors the backend allowlist policy: every field outside title,
   * description, and iconPath is read-only (URL, transport, auth, trust). Any
   * other change would let the user redirect OBO tokens to an arbitrary endpoint.
   */
  const authType = useWatch<MCPServerFormData, 'auth.auth_type'>({
    control: methods.control,
    name: 'auth.auth_type',
  });
  const isOboLockedReadOnly = isEditMode && authType === AuthTypeEnum.OBO && !canConfigureObo;

  return (
    <FormProvider {...methods}>
      <div className="space-y-4 px-1 py-1">
        <BasicInfoSection />
        <fieldset
          disabled={isOboLockedReadOnly}
          className="contents space-y-4"
          aria-disabled={isOboLockedReadOnly}
        >
          <ConnectionSection />

          <TransportSection />

          <AuthSection isEditMode={isEditMode} serverName={server?.serverName} />

          <TrustSection />
        </fieldset>
      </div>
    </FormProvider>
  );
}
