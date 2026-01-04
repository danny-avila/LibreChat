import { FormProvider } from 'react-hook-form';
import ConnectionSection from './sections/ConnectionSection';
import BasicInfoSection from './sections/BasicInfoSection';
import TransportSection from './sections/TransportSection';
import AuthSection from './sections/AuthSection';
import TrustSection from './sections/TrustSection';
import type { useMCPServerForm } from './hooks/useMCPServerForm';

interface MCPServerFormProps {
  formHook: ReturnType<typeof useMCPServerForm>;
}

export default function MCPServerForm({ formHook }: MCPServerFormProps) {
  const { methods, isEditMode, server } = formHook;

  return (
    <FormProvider {...methods}>
      <div className="space-y-4 px-1 py-1">
        <BasicInfoSection />

        <ConnectionSection />

        <TransportSection />

        <AuthSection isEditMode={isEditMode} serverName={server?.serverName} />

        <TrustSection />
      </div>
    </FormProvider>
  );
}
