import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@librechat/client';
import { useLocalize } from '~/hooks';
import APIRegistryList from './APIRegistryList';
import APIRegistryDialog from './APIRegistryDialog';

export default function APIRegistryPanel() {
  const localize = useLocalize();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedAPI, setSelectedAPI] = useState<any>(null);

  const handleAddAPI = () => {
    setSelectedAPI(null);
    setIsDialogOpen(true);
  };

  const handleEditAPI = (api: any) => {
    setSelectedAPI(api);
    setIsDialogOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-light px-4 py-3">
        <div>
          <h2 className="text-lg font-semibold text-text-primary">
            {localize('com_ui_api_registry')}
          </h2>
          <p className="text-sm text-text-secondary">
            {localize('com_ui_api_registry_description')}
          </p>
        </div>
        <Button
          onClick={handleAddAPI}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* API List */}
      <div className="flex-1 overflow-y-auto">
        <APIRegistryList onEditAPI={handleEditAPI} />
      </div>

      {/* Add/Edit Dialog */}
      <APIRegistryDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        api={selectedAPI}
      />
    </div>
  );
}