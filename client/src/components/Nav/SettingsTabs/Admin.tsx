import React, { useState } from 'react';
import { useLocalize } from '~/hooks';
import { Input, Button, Label, Card, CardHeader, CardTitle, CardContent, CardDescription } from '~/components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dataService, QueryKeys } from 'librechat-data-provider';
import type { TProvider } from 'librechat-data-provider';

// Helper function to get query data (replace with actual import if it exists elsewhere)
// Not strictly needed for this component's current functionality but kept from diff
const getQueryData = <TData = unknown>(queryClient, queryKey: string[]) => {
  return queryClient.getQueryData<TData>(queryKey);
};

const AdminSettings = () => {
  const localize = useLocalize();
  const queryClient = useQueryClient();

  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderBaseURL, setNewProviderBaseURL] = useState('');

  const { data: providers, isLoading: isLoadingProviders, error: providersError } = useQuery<TProvider[]>({
    queryKey: [QueryKeys.adminProviders],
    queryFn: () => dataService.getAdminProviders(),
  });

  const createProviderMutation = useMutation({
    mutationFn: (providerData: Partial<TProvider>) => dataService.createAdminProvider(providerData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QueryKeys.adminProviders] });
      setNewProviderName('');
      setNewProviderBaseURL('');
      // TODO: Add toast notification for success
    },
    onError: (error: Error) => {
      // TODO: Add toast notification for error
      console.error('Error creating provider:', error);
    },
  });

  const handleAddProvider = () => {
    if (!newProviderName.trim()) {
      // TODO: Show validation error (e.g., using a state variable and displaying a message)
      alert(localize('com_admin_provider_name_required_error')); // Simple alert for now
      return;
    }
    createProviderMutation.mutate({ name: newProviderName, baseURL: newProviderBaseURL });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{localize('com_admin_providers_manage')}</CardTitle>
          <CardDescription>{localize('com_admin_providers_description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-2 text-lg font-medium">{localize('com_admin_providers_current')}</h3>
            {isLoadingProviders && <p>{localize('com_ui_loading_providers')}</p>}
            {providersError && <p className="text-red-500">{localize('com_admin_providers_error_loading')}: {(providersError as Error).message}</p>}
            {providers && providers.length === 0 && !isLoadingProviders && <p>{localize('com_admin_providers_none_configured')}</p>}
            {providers && providers.length > 0 && (
              <ul className="space-y-2">
                {providers.map((provider) => (
                  <li key={provider.id ?? provider._id?.toString()} className="p-2 border rounded-md flex justify-between items-center">
                    <span>{provider.name} ({provider.baseURL || localize('com_admin_provider_no_base_url')})</span>
                    <div>
                      <Button size="sm" variant="outline" className="mr-2">{localize('com_ui_edit')}</Button>
                      <Button size="sm" variant="destructive" className="mr-2">{localize('com_ui_delete')}</Button>
                      <Button size="sm" variant="secondary">{localize('com_admin_providers_fetch_models')}</Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="p-4 border rounded-md space-y-3">
            <h3 className="text-lg font-medium">{localize('com_admin_providers_add_new')}</h3>
            <div>
              <Label htmlFor="providerName">{localize('com_admin_provider_name')}</Label>
              <Input id="providerName" type="text" value={newProviderName} onChange={(e) => setNewProviderName(e.target.value)} placeholder={localize('com_admin_provider_name_placeholder')} />
            </div>
            <div>
              <Label htmlFor="providerBaseURL">{localize('com_admin_provider_base_url')}</Label>
              <Input id="providerBaseURL" type="text" value={newProviderBaseURL} onChange={(e) => setNewProviderBaseURL(e.target.value)} placeholder="https://api.example.com/v1" />
            </div>
            <Button size="sm" onClick={handleAddProvider} disabled={createProviderMutation.isLoading}>
              {createProviderMutation.isLoading ? localize('com_ui_saving') : localize('com_ui_add')}
            </Button>
            {createProviderMutation.isError && (
              <p className="text-red-500">{localize('com_ui_error')}: {(createProviderMutation.error as Error)?.message}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{localize('com_admin_apikeys_manage')}</CardTitle>
          <CardDescription>{localize('com_admin_apikeys_description')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p>{localize('com_admin_apikeys_content_placeholder')}</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminSettings;
