import { Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useFormContext } from 'react-hook-form';
import { Input, Label, Button, Textarea } from '@librechat/client';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const VARIABLE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

export default function CustomUserVarsDefinitionSection() {
  const localize = useLocalize();
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  const { fields, append, remove } = useFieldArray({ control, name: 'customUserVars' });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-medium">
            {localize('com_ui_mcp_custom_user_vars_definition')}
          </Label>
          <p className="text-xs text-text-secondary">
            {localize('com_ui_mcp_custom_user_vars_definition_description')}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ key: '', title: '', description: '' })}
          className="h-7 shrink-0 gap-1 px-2 text-xs"
        >
          <Plus className="size-3" aria-hidden="true" />
          {localize('com_ui_mcp_add_variable')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-light px-3 py-2 text-center text-xs text-text-secondary">
          {localize('com_ui_mcp_no_custom_vars')}
        </p>
      ) : (
        <div className="space-y-3 rounded-lg border border-border-light p-3">
          {fields.map((field, index) => (
            <div key={field.id} className="space-y-2 rounded border border-border-light p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-text-secondary">
                  {localize('com_ui_mcp_variable')} {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="flex size-6 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-destructive"
                  aria-label={localize('com_ui_delete')}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`customUserVars.${index}.key`} className="text-xs font-medium">
                    {localize('com_ui_mcp_variable_key')}{' '}
                    <span aria-hidden="true" className="text-text-secondary">
                      *
                    </span>
                    <span className="sr-only">{localize('com_ui_field_required')}</span>
                  </Label>
                  <Input
                    id={`customUserVars.${index}.key`}
                    placeholder={localize('com_ui_mcp_variable_key_placeholder')}
                    aria-invalid={errors.customUserVars?.[index]?.key ? 'true' : 'false'}
                    {...register(`customUserVars.${index}.key`, {
                      required: localize('com_ui_field_required'),
                      pattern: {
                        value: VARIABLE_KEY_PATTERN,
                        message: localize('com_ui_mcp_variable_key_invalid'),
                      },
                    })}
                    className={cn(
                      'font-mono text-xs',
                      errors.customUserVars?.[index]?.key && 'border-border-destructive',
                    )}
                  />
                  {errors.customUserVars?.[index]?.key && (
                    <p role="alert" className="text-xs text-text-destructive">
                      {errors.customUserVars?.[index]?.key?.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label htmlFor={`customUserVars.${index}.title`} className="text-xs font-medium">
                    {localize('com_ui_mcp_variable_title')}{' '}
                    <span aria-hidden="true" className="text-text-secondary">
                      *
                    </span>
                    <span className="sr-only">{localize('com_ui_field_required')}</span>
                  </Label>
                  <Input
                    id={`customUserVars.${index}.title`}
                    placeholder={localize('com_ui_mcp_variable_title_placeholder')}
                    aria-invalid={errors.customUserVars?.[index]?.title ? 'true' : 'false'}
                    {...register(`customUserVars.${index}.title`, {
                      required: localize('com_ui_field_required'),
                      validate: (value) =>
                        value.trim().length > 0 || localize('com_ui_field_required'),
                    })}
                    className={cn(
                      'text-xs',
                      errors.customUserVars?.[index]?.title && 'border-border-destructive',
                    )}
                  />
                  {errors.customUserVars?.[index]?.title && (
                    <p role="alert" className="text-xs text-text-destructive">
                      {errors.customUserVars?.[index]?.title?.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor={`customUserVars.${index}.description`}
                  className="text-xs font-medium"
                >
                  {localize('com_ui_description')}{' '}
                  <span className="text-xs text-text-secondary">{localize('com_ui_optional')}</span>
                </Label>
                <Textarea
                  id={`customUserVars.${index}.description`}
                  placeholder={localize('com_ui_mcp_variable_description_placeholder')}
                  rows={2}
                  {...register(`customUserVars.${index}.description`)}
                  className="resize-none text-xs"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
