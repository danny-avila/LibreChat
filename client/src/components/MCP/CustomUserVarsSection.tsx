import React, { useMemo } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { Input, Label, Button, TooltipAnchor, CircleHelpIcon } from '@librechat/client';
import { useMCPAuthValuesQuery } from '~/data-provider/Tools/queries';
import { useLocalize } from '~/hooks';

export interface CustomUserVarConfig {
  title: string;
  description?: string;
}

interface CustomUserVarsSectionProps {
  serverName: string;
  fields: Record<string, CustomUserVarConfig>;
  onSave: (authData: Record<string, string>) => void;
  onRevoke: () => void;
  isSubmitting?: boolean;
}

interface AuthFieldProps {
  name: string;
  config: CustomUserVarConfig;
  hasValue: boolean;
  control: any;
  errors: any;
}

function AuthField({ name, config, hasValue, control, errors }: AuthFieldProps) {
  const localize = useLocalize();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <TooltipAnchor
          enableHTML={true}
          description={config.description || ''}
          render={
            <div className="flex items-center gap-2">
              <Label htmlFor={name} className="text-sm font-medium">
                {config.title}
              </Label>
              <CircleHelpIcon className="h-6 w-6 cursor-help text-text-secondary transition-colors hover:text-text-primary" />
            </div>
          }
        />
        {hasValue ? (
          <div className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
            <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
            <span>{localize('com_ui_set')}</span>
          </div>
        ) : (
          <div className="flex min-w-fit items-center gap-2 whitespace-nowrap rounded-full border border-border-light px-2 py-0.5 text-xs font-medium text-text-secondary">
            <div className="h-1.5 w-1.5 rounded-full border border-border-medium" />
            <span>{localize('com_ui_unset')}</span>
          </div>
        )}
      </div>
      <Controller
        name={name}
        control={control}
        defaultValue=""
        render={({ field }) => (
          <Input
            id={name}
            type="text"
            {...field}
            placeholder={
              hasValue
                ? localize('com_ui_mcp_update_var', { 0: config.title })
                : localize('com_ui_mcp_enter_var', { 0: config.title })
            }
            className="w-full shadow-sm sm:text-sm"
          />
        )}
      />
      {errors[name] && <p className="text-xs text-red-500">{errors[name]?.message}</p>}
    </div>
  );
}

export default function CustomUserVarsSection({
  serverName,
  fields,
  onSave,
  onRevoke,
  isSubmitting = false,
}: CustomUserVarsSectionProps) {
  const localize = useLocalize();

  // Fetch auth value flags for the server
  const { data: authValuesData } = useMCPAuthValuesQuery(serverName, {
    enabled: !!serverName,
  });

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Record<string, string>>({
    defaultValues: useMemo(() => {
      const initial: Record<string, string> = {};
      Object.keys(fields).forEach((key) => {
        initial[key] = '';
      });
      return initial;
    }, [fields]),
  });

  const onFormSubmit = (data: Record<string, string>) => {
    onSave(data);
  };

  const handleRevokeClick = () => {
    onRevoke();
    reset();
  };

  if (!fields || Object.keys(fields).length === 0) {
    return null;
  }

  return (
    <div className="flex-1 space-y-4">
      <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">
        {Object.entries(fields).map(([key, config]) => {
          const hasValue = authValuesData?.authValueFlags?.[key] || false;

          return (
            <AuthField
              key={key}
              name={key}
              config={config}
              hasValue={hasValue}
              control={control}
              errors={errors}
            />
          );
        })}
      </form>

      <div className="flex justify-end gap-2">
        <Button onClick={handleRevokeClick} variant="destructive" disabled={isSubmitting}>
          {localize('com_ui_revoke')}
        </Button>
        <Button onClick={handleSubmit(onFormSubmit)} variant="submit" disabled={isSubmitting}>
          {isSubmitting ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}
