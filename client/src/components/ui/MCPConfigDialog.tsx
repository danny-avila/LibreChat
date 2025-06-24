import React, { useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Input, Label, OGDialog, Button } from '~/components/ui';
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize } from '~/hooks';

export interface ConfigFieldDetail {
  title: string;
  description: string;
}

interface MCPConfigDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  fieldsSchema: Record<string, ConfigFieldDetail>;
  initialValues: Record<string, string>;
  onSave: (updatedValues: Record<string, string>) => void;
  isSubmitting?: boolean;
  onRevoke?: () => void;
  serverName: string;
}

export default function MCPConfigDialog({
  isOpen,
  onOpenChange,
  fieldsSchema,
  initialValues,
  onSave,
  isSubmitting = false,
  onRevoke,
  serverName,
}: MCPConfigDialogProps) {
  const localize = useLocalize();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, _ },
  } = useForm<Record<string, string>>({
    defaultValues: initialValues,
  });

  useEffect(() => {
    if (isOpen) {
      reset(initialValues);
    }
  }, [isOpen, initialValues, reset]);

  const onFormSubmit = (data: Record<string, string>) => {
    onSave(data);
  };

  const handleRevoke = () => {
    if (onRevoke) {
      onRevoke();
    }
  };

  const dialogTitle = localize('com_ui_configure_mcp_variables_for', { 0: serverName });
  const dialogDescription = localize('com_ui_mcp_dialog_desc');

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        className="sm:max-w-lg"
        title={dialogTitle}
        description={dialogDescription}
        headerClassName="px-6 pt-6 pb-4"
        main={
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4 px-6 pb-2">
            {Object.entries(fieldsSchema).map(([key, details]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium">
                  {details.title}
                </Label>
                <Controller
                  name={key}
                  control={control}
                  defaultValue={initialValues[key] || ''}
                  render={({ field }) => (
                    <Input
                      id={key}
                      type="text"
                      {...field}
                      placeholder={localize('com_ui_mcp_enter_var', { 0: details.title })}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                    />
                  )}
                />
                {details.description && (
                  <p
                    className="text-xs text-text-secondary [&_a]:text-blue-500 [&_a]:hover:text-blue-600 dark:[&_a]:text-blue-400 dark:[&_a]:hover:text-blue-300"
                    dangerouslySetInnerHTML={{ __html: details.description }}
                  />
                )}
                {errors[key] && <p className="text-xs text-red-500">{errors[key]?.message}</p>}
              </div>
            ))}
          </form>
        }
        selection={{
          selectHandler: handleSubmit(onFormSubmit),
          selectClasses: 'bg-green-500 hover:bg-green-600 text-white',
          selectText: isSubmitting ? localize('com_ui_saving') : localize('com_ui_save'),
        }}
        buttons={
          onRevoke && (
            <Button
              onClick={handleRevoke}
              className="bg-red-600 text-white hover:bg-red-700 dark:hover:bg-red-800"
              disabled={isSubmitting}
            >
              {localize('com_ui_revoke')}
            </Button>
          )
        }
        footerClassName="flex justify-end gap-2 px-6 pb-6 pt-2"
        showCancelButton={true}
      />
    </OGDialog>
  );
}
