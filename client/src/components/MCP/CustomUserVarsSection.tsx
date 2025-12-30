import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { useForm, Controller } from 'react-hook-form';
import { Input, Label, Button } from '@librechat/client';
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
  const statusText = hasValue ? localize('com_ui_set') : localize('com_ui_unset');

  const sanitizer = useMemo(() => {
    const instance = DOMPurify();
    instance.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName && node.tagName === 'A') {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    return instance;
  }, []);

  const sanitizedDescription = useMemo(() => {
    if (!config.description) {
      return '';
    }
    try {
      return sanitizer.sanitize(config.description, {
        ALLOWED_TAGS: ['a', 'strong', 'b', 'em', 'i', 'br', 'code'],
        ALLOWED_ATTR: ['href', 'class', 'target', 'rel'],
        ALLOW_DATA_ATTR: false,
        ALLOW_ARIA_ATTR: false,
      });
    } catch (error) {
      console.error('Sanitization failed', error);
      return config.description;
    }
  }, [config.description, sanitizer]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor={name} className="text-sm font-medium">
          {config.title} <span className="sr-only">({statusText})</span>
        </Label>
        <div aria-hidden="true">
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
            className="w-full rounded border border-border-medium bg-transparent px-2 py-1 text-text-primary placeholder:text-text-secondary focus:outline-none sm:text-sm"
          />
        )}
      />
      {sanitizedDescription && (
        <p
          className="text-xs text-text-secondary [&_a]:text-blue-500 [&_a]:hover:underline"
          dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
        />
      )}
      {errors[name] && <p className="text-xs text-red-500">{errors[name]?.message}</p>}
    </div>
  );
}

export default function CustomUserVarsSection({
  fields,
  onSave,
  onRevoke,
  serverName,
  isSubmitting = false,
}: CustomUserVarsSectionProps) {
  const localize = useLocalize();

  const { data: authValuesData } = useMCPAuthValuesQuery(serverName, {
    enabled: !!serverName,
  });

  const {
    reset,
    control,
    handleSubmit,
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
        <Button
          type="button"
          variant="destructive"
          disabled={isSubmitting}
          onClick={handleRevokeClick}
        >
          {localize('com_ui_revoke')}
        </Button>
        <Button
          type="button"
          variant="submit"
          disabled={isSubmitting}
          onClick={handleSubmit(onFormSubmit)}
        >
          {isSubmitting ? localize('com_ui_saving') : localize('com_ui_save')}
        </Button>
      </div>
    </div>
  );
}
