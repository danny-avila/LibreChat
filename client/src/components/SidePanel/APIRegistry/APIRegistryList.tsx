import React from 'react';
import { Loader2 } from 'lucide-react';
import { useLocalize } from '~/hooks';
import { useGetAPIRegistries } from '~/data-provider';
import APIRegistryCard from './APIRegistryCard';

interface APIRegistryListProps {
  onEditAPI: (api: any) => void;
}

export default function APIRegistryList({ onEditAPI }: APIRegistryListProps) {
  const localize = useLocalize();
  const { data, isLoading, error } = useGetAPIRegistries();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-text-secondary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-red-500">
          {localize('com_ui_error_loading_apis')}
        </p>
      </div>
    );
  }

  const apis = data?.data?.apis || [];

  if (apis.length === 0) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-text-secondary">
          {localize('com_ui_no_apis_registered')}
        </p>
        <p className="text-xs text-text-tertiary">
          {localize('com_ui_add_api_to_get_started')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      {apis.map((api: any) => (
        <APIRegistryCard
          key={api.serverName}
          api={api}
          onEdit={() => onEditAPI(api)}
        />
      ))}
    </div>
  );
}