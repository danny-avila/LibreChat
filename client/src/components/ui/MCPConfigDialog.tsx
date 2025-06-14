import React, { useEffect, useState } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Input, Label, OGDialog, Button } from '~/components/ui'; // Added Button, removed Textarea
import OGDialogTemplate from '~/components/ui/OGDialogTemplate';
import { useLocalize } from '~/hooks';
import {EyeIcon, EyeOffIcon} from "lucide-react";

export interface ConfigFieldDetail {
  title: string;
  description:string;
}

interface MCPConfigDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  fieldsSchema: Record<string, ConfigFieldDetail>;
  initialValues: Record<string, string>;
  onSave: (updatedValues: Record<string, string>) => void;
  isSubmitting?: boolean;
  onRevoke?: () => void;
}

export default function MCPConfigDialog({
  isOpen,
  onOpenChange,
  fieldsSchema,
  initialValues,
  onSave,
  isSubmitting = false,
  onRevoke,
}: MCPConfigDialogProps) {
  const localize = useLocalize();
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Record<string, string>>({
    defaultValues: initialValues,
  });

  const [revealedVars, setRevealedVars] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isOpen) {
      reset(initialValues);
      setRevealedVars({});
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

  const toggleRevealVar = (key: string) => {
    setRevealedVars((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const dialogTitle = localize('com_ui_configure_credentials');
  const dialogDescription = localize('com_ui_mcp_dialog_desc');

  return (
    <OGDialog open={isOpen} onOpenChange={onOpenChange}>
      <OGDialogTemplate
        className="sm:max-w-lg"
        title={dialogTitle}
        description={dialogDescription}
        headerClassName="px-6 pt-6 pb-4"
        main={
          <form onSubmit={handleSubmit(onFormSubmit)} className="px-6 pb-2 space-y-4">
            {Object.entries(fieldsSchema).map(([key, details]) => (
              <div key={key} className="space-y-2">
                <Label htmlFor={key} className="text-sm font-medium">
                  {details.title}
                </Label>
                <div className="relative flex items-center">
                  <Controller
                    name={key}
                    control={control}
                    defaultValue={initialValues[key] || ''}
                    render={({ field }) => (
                      <Input
                        id={key}
                        type={!revealedVars[key] ? 'password' : 'text'}
                        {...field}
                        placeholder={localize('com_ui_mcp_enter_var', { 0: details.title })}
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white sm:text-sm"
                      />
                    )}
                  />
                  <button
                    type="button"
                    onClick={() => toggleRevealVar(key)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 transform p-1 text-text-secondary hover:text-text-primary"
                    aria-label={
                      revealedVars[key]
                        ? localize('com_ui_hide_value')
                        : localize('com_ui_reveal_value')
                    }
                  >
                    {revealedVars[key] ? (
                      <EyeOffIcon className="h-5 w-5" />
                    ) : (
                      <EyeIcon className="h-5 w-5" />
                    )}
                  </button>
                </div>
                {details.description && (
                  <p
                    className="text-xs text-text-secondary"
                    dangerouslySetInnerHTML={{ __html: details.description }}
                  />
                )}
                {errors[key] && (
                  <p className="text-xs text-red-500">{errors[key]?.message}</p>
                )}
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
