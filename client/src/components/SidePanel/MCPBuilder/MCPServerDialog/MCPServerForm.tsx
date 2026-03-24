import { FormProvider } from 'react-hook-form';
import type { useMCPServerForm } from './hooks/useMCPServerForm';
import CustomUserVarsDefinitionSection from './sections/CustomUserVarsDefinitionSection';
import ConnectionSection from './sections/ConnectionSection';
import BasicInfoSection from './sections/BasicInfoSection';
import TransportSection from './sections/TransportSection';
import AdvancedSection from './sections/AdvancedSection';
import HeadersSection from './sections/HeadersSection';
import TrustSection from './sections/TrustSection';
import AuthSection from './sections/AuthSection';
import { useLocalize } from '~/hooks';

interface MCPServerFormProps {
  formHook: ReturnType<typeof useMCPServerForm>;
}

export default function MCPServerForm({ formHook }: MCPServerFormProps) {
  const { methods, isEditMode, server } = formHook;
  const localize = useLocalize();

  return (
    <FormProvider {...methods}>
      <div className="space-y-4 px-1 py-1">
        <BasicInfoSection />

        <ConnectionSection />

        <TransportSection />

        <HeadersSection isEditMode={isEditMode} />

        <AuthSection isEditMode={isEditMode} serverName={server?.serverName} />

        <CustomUserVarsDefinitionSection />

        <div className="space-y-2">
          <p className="text-sm font-medium">{localize('com_ui_mcp_advanced')}</p>
          <div className="rounded-lg border border-border-light p-3">
            <AdvancedSection />
          </div>
        </div>

        <TrustSection />
      </div>
    </FormProvider>
  );
}
