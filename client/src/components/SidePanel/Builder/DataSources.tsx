import React, { useState } from 'react';
import { useFormContext, useFieldArray, Controller } from 'react-hook-form';
import {
  OGDialog,
  OGDialogTemplate,
  Button,
  Label,
  Input,
  SelectDropDown,
} from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn, defaultTextProps, removeFocusOutlines } from '~/utils';
import { Trash2, PlusIcon, Database, Pencil } from 'lucide-react';

const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 dark:border-gray-800 dark:bg-gray-800 rounded-xl mb-2',
  removeFocusOutlines,
);

const labelClass = 'mb-2 text-token-text-primary block font-medium text-sm';

type DataSourceForm = {
  id?: string;
  type: string;
  name: string;
  config: {
    host: string;
    port: number;
    database: string;
    user: string;
    password?: string;
  };
};

const defaultDataSource: DataSourceForm = {
  type: 'MySQL',
  name: '',
  config: {
    host: '',
    port: 3306,
    database: '',
    user: '',
    password: '',
  },
};

export default function DataSources({ assistant_id }: { assistant_id?: string }) {
  const localize = useLocalize();
  const { control } = useFormContext();
  const { fields, append, remove, update } = useFieldArray({
    control,
    name: 'data_sources',
  });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [newDataSource, setNewDataSource] = useState<DataSourceForm>(defaultDataSource);

  const handleOpenDialog = () => {
    setEditingIndex(null);
    setNewDataSource(defaultDataSource);
    setIsDialogOpen(true);
  };

  const handleEdit = (index: number) => {
    const item = fields[index] as unknown as DataSourceForm;
    setEditingIndex(index);
    setNewDataSource({
      id: item.id, // Preserve ID
      type: item.type || 'MySQL',
      name: item.name || '',
      config: {
        host: item.config?.host || '',
        port: item.config?.port || 3306,
        database: item.config?.database || '',
        user: item.config?.user || '',
        password: item.config?.password || '', // This might be empty/encrypted depending on backend response
      },
    });
    setIsDialogOpen(true);
  };

  const handleSaveDataSource = (e: React.MouseEvent) => {
    e.preventDefault();
    
    if (!newDataSource.name || !newDataSource.config.host) {
      return;
    }

    if (editingIndex !== null) {
      // Update existing
      update(editingIndex, {
        ...newDataSource,
        // Keep existing ID if present, else generate new one (should have one from initial add)
        id: newDataSource.id || fields[editingIndex].id, 
      });
    } else {
      // Add new
      const id = 'ds_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      append({
        id,
        ...newDataSource,
      });
    }
    
    setIsDialogOpen(false);
    setNewDataSource(defaultDataSource);
    setEditingIndex(null);
  };

  const dbOptions = ['MySQL', 'PostgreSQL'];

  return (
    <div className="mb-6">
      <div className="mb-1.5 flex items-center justify-between">
        <label className="text-token-text-primary block font-medium">
          Data Sources (MySQL/PostgreSQL)
        </label>
      </div>
      
      <div className="flex flex-col gap-2">
        {fields.map((field: any, index) => (
          <div key={field.id} className="flex items-center justify-between p-3 border rounded-lg bg-surface-hover border-border-light">
            <div className="flex items-center gap-3 overflow-hidden">
              <Database className="w-5 h-5 text-token-text-secondary flex-shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm truncate">{field.name}</div>
                <div className="text-xs text-token-text-tertiary truncate">
                  {field.type}://{field.config.host}:{field.config.port}/{field.config.database}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => handleEdit(index)}
                className="p-1 text-token-text-tertiary hover:text-token-text-primary transition-colors cursor-pointer"
                title="Edit"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(index)}
                className="p-1 text-token-text-tertiary hover:text-red-500 transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={handleOpenDialog}
          disabled={!assistant_id}
          className="btn btn-neutral border-token-border-light relative h-8 rounded-lg font-medium w-full"
        >
          <div className="flex w-full items-center justify-center gap-2">
            <PlusIcon className="w-4 h-4" />
            Add Data Source
          </div>
        </button>
        
        {!assistant_id && (
          <p className="text-xs text-token-text-tertiary mt-1">
            Please create the assistant first to add data sources.
          </p>
        )}
      </div>

      <OGDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <OGDialogTemplate
          title={editingIndex !== null ? "Edit Database Connection" : "Add Database Connection"}
          className="max-h-[90vh] w-11/12 overflow-y-auto md:max-w-lg"
          main={
            <div className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className={labelClass}>Database Type</label>
                <SelectDropDown
                  value={newDataSource.type}
                  setValue={(val) => setNewDataSource({ ...newDataSource, type: val })}
                  availableValues={dbOptions}
                  showAbove={false}
                  showLabel={false}
                />
              </div>

              {/* Name */}
              <div>
                <label className={labelClass}>Connection Name</label>
                <Input
                  value={newDataSource.name}
                  onChange={(e) => setNewDataSource({ ...newDataSource, name: e.target.value })}
                  placeholder="e.g., Production DB"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Host */}
                <div>
                  <label className={labelClass}>Host</label>
                  <Input
                    value={newDataSource.config.host}
                    onChange={(e) => setNewDataSource({ 
                      ...newDataSource, 
                      config: { ...newDataSource.config, host: e.target.value } 
                    })}
                    placeholder="localhost"
                    className={inputClass}
                  />
                </div>
                {/* Port */}
                <div>
                  <label className={labelClass}>Port</label>
                  <Input
                    type="number"
                    value={newDataSource.config.port}
                    onChange={(e) => setNewDataSource({ 
                      ...newDataSource, 
                      config: { ...newDataSource.config, port: parseInt(e.target.value) || 3306 } 
                    })}
                    className={inputClass}
                  />
                </div>
              </div>

              {/* Database */}
              <div>
                <label className={labelClass}>Database Name</label>
                <Input
                  value={newDataSource.config.database}
                  onChange={(e) => setNewDataSource({ 
                    ...newDataSource, 
                    config: { ...newDataSource.config, database: e.target.value } 
                  })}
                  placeholder="my_database"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* User */}
                <div>
                  <label className={labelClass}>User</label>
                  <Input
                    value={newDataSource.config.user}
                    onChange={(e) => setNewDataSource({ 
                      ...newDataSource, 
                      config: { ...newDataSource.config, user: e.target.value } 
                    })}
                    className={inputClass}
                  />
                </div>
                {/* Password */}
                <div>
                  <label className={labelClass}>Password</label>
                  <Input
                    type="password"
                    value={newDataSource.config.password}
                    onChange={(e) => setNewDataSource({ 
                      ...newDataSource, 
                      config: { ...newDataSource.config, password: e.target.value } 
                    })}
                    placeholder={editingIndex !== null ? "(Leave blank to keep existing)" : ""}
                    className={inputClass}
                  />
                </div>
              </div>
            </div>
          }
          buttons={
            <div className="flex gap-2 justify-end w-full">
              <Button
                type="button" 
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="button" 
                variant="submit"
                onClick={handleSaveDataSource}
                disabled={!newDataSource.name || !newDataSource.config.host}
              >
                {editingIndex !== null ? "Save Changes" : "Add"}
              </Button>
            </div>
          }
        />
      </OGDialog>
    </div>
  );
}
