import { useState, useRef, useEffect, useMemo } from 'react';
import { Plus, Trash2, Lock, LockOpen, ChevronDown } from 'lucide-react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import {
  Input,
  Label,
  Button,
  SecretInput,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@librechat/client';
import type { MCPServerFormData, CustomUserVarEntry } from '../hooks/useMCPServerForm';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

const ENV_VAR_PATTERN = /\$\{[^}]+\}/;

interface HeaderRowProps {
  index: number;
  onRemove: () => void;
  availableVars: CustomUserVarEntry[];
  isEditMode: boolean;
  initialSecretHeaderKeys: Set<string>;
}

function HeaderRow({
  index,
  onRemove,
  availableVars,
  isEditMode,
  initialSecretHeaderKeys,
}: HeaderRowProps) {
  const localize = useLocalize();
  const {
    control,
    register,
    setValue,
    getValues,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  const [showVarMenu, setShowVarMenu] = useState(false);

  const isSecret = useWatch<MCPServerFormData, `headers.${number}.isSecret`>({
    control,
    name: `headers.${index}.isSecret`,
  });

  const headerKey =
    useWatch<MCPServerFormData, `headers.${number}.key`>({
      control,
      name: `headers.${index}.key`,
    }) ?? '';

  // In edit mode, only allow blank values for headers that were initially secret.
  // New secret headers (including ones that were previously non-secret) must have a value.
  const isInitiallySecretHeader = initialSecretHeaderKeys.has(headerKey.trim());
  const isNewSecretHeader = isSecret && isEditMode && !isInitiallySecretHeader;

  const insertVariable = (varKey: string) => {
    const current = getValues(`headers.${index}.value`) ?? '';
    setValue(`headers.${index}.value`, `${current}{{${varKey}}}`, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setShowVarMenu(false);
  };

  const toggleSecret = () => {
    setValue(`headers.${index}.isSecret`, !isSecret, { shouldDirty: true });
    if (isSecret) {
      // Switching from secret → non-secret: clear the masked/empty value so user enters new one
      setValue(`headers.${index}.value`, '', { shouldDirty: true });
    }
  };

  return (
    <div className="flex items-start gap-1.5">
      {/* Key input */}
      <div className="w-2/5 space-y-1">
        <Input
          placeholder={localize('com_ui_mcp_header_key_placeholder')}
          aria-label={localize('com_ui_mcp_header_key')}
          aria-invalid={errors.headers?.[index]?.key ? 'true' : 'false'}
          {...register(`headers.${index}.key`, {
            required: localize('com_ui_field_required'),
            validate: (value) => value.trim().length > 0 || localize('com_ui_field_required'),
          })}
          className={cn('text-xs', errors.headers?.[index]?.key && 'border-border-destructive')}
        />
        {errors.headers?.[index]?.key && (
          <p role="alert" className="text-xs text-text-destructive">
            {errors.headers?.[index]?.key?.message}
          </p>
        )}
      </div>

      {/* Value input (regular or secret) + optional variable picker */}
      <div className="flex min-w-0 flex-1 items-start gap-1">
        <div className="flex-1 space-y-1">
          {isSecret ? (
            <SecretInput
              placeholder={
                isEditMode && !isNewSecretHeader
                  ? localize('com_ui_mcp_header_value_secret_placeholder')
                  : localize('com_ui_mcp_header_value_placeholder')
              }
              aria-label={localize('com_ui_mcp_header_value')}
              aria-invalid={errors.headers?.[index]?.value ? 'true' : 'false'}
              {...register(`headers.${index}.value`, {
                required: (!isEditMode || isNewSecretHeader) && localize('com_ui_field_required'),
                validate: (v) => {
                  // Reject whitespace-only values
                  if (v && v.trim().length === 0) {
                    return localize('com_ui_field_required');
                  }
                  // Reject env var patterns
                  if (ENV_VAR_PATTERN.test(v)) {
                    return localize('com_ui_mcp_header_env_var_not_allowed');
                  }
                  return true;
                },
              })}
              className={cn(
                'text-xs',
                errors.headers?.[index]?.value && 'border-border-destructive',
              )}
            />
          ) : (
            <Input
              placeholder={localize('com_ui_mcp_header_value_placeholder')}
              aria-label={localize('com_ui_mcp_header_value')}
              aria-invalid={errors.headers?.[index]?.value ? 'true' : 'false'}
              {...register(`headers.${index}.value`, {
                required: localize('com_ui_field_required'),
                validate: (v) => {
                  // Reject whitespace-only values
                  if (v && v.trim().length === 0) {
                    return localize('com_ui_field_required');
                  }
                  // Reject env var patterns
                  if (ENV_VAR_PATTERN.test(v)) {
                    return localize('com_ui_mcp_header_env_var_not_allowed');
                  }
                  return true;
                },
              })}
              className={cn(
                'text-xs',
                errors.headers?.[index]?.value && 'border-border-destructive',
              )}
            />
          )}
          {errors.headers?.[index]?.value && (
            <p role="alert" className="text-xs text-text-destructive">
              {errors.headers?.[index]?.value?.message}
            </p>
          )}
        </div>

        {/* Variable picker — only for non-secret headers with available vars */}
        {!isSecret && availableVars.length > 0 && (
          <DropdownMenu open={showVarMenu} onOpenChange={setShowVarMenu}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="mt-0.5 flex h-9 shrink-0 items-center gap-0.5 rounded border border-border-light px-1.5 text-xs text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
                aria-label={localize('com_ui_mcp_insert_variable')}
                title={localize('com_ui_mcp_insert_variable')}
              >
                <span className="max-w-[3.5rem] truncate font-mono leading-none">{'{{…}}'}</span>
                <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="z-[160] min-w-[10rem]">
              {availableVars.map(({ key, title }) => (
                <DropdownMenuItem
                  key={key}
                  onSelect={() => insertVariable(key)}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <span className="font-mono text-text-secondary">{`{{${key}}}`}</span>
                  <span className="text-text-primary">{title}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Secret toggle */}
      <button
        type="button"
        onClick={toggleSecret}
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded border transition-colors',
          isSecret
            ? 'border-amber-300 bg-amber-50 text-amber-600 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-400 dark:hover:bg-amber-900'
            : 'border-border-light text-text-secondary hover:bg-surface-hover hover:text-text-primary',
        )}
        aria-label={
          isSecret ? localize('com_ui_mcp_mark_not_secret') : localize('com_ui_mcp_mark_secret')
        }
        aria-pressed={!!isSecret}
        title={
          isSecret ? localize('com_ui_mcp_mark_not_secret') : localize('com_ui_mcp_mark_secret')
        }
      >
        {isSecret ? (
          <Lock className="size-3.5" aria-hidden="true" />
        ) : (
          <LockOpen className="size-3.5" aria-hidden="true" />
        )}
      </button>

      {/* Delete */}
      <button
        type="button"
        onClick={onRemove}
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-destructive"
        aria-label={localize('com_ui_delete')}
      >
        <Trash2 className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

interface HeadersSectionProps {
  isEditMode: boolean;
}

export default function HeadersSection({ isEditMode }: HeadersSectionProps) {
  const localize = useLocalize();
  const { control, getValues } = useFormContext<MCPServerFormData>();

  const { fields, append, remove } = useFieldArray({ control, name: 'headers' });

  // Synchronous initial computation — correct on first render (no useEffect delay)
  const [initialSecretKeys, setInitialSecretKeys] = useState<Set<string>>(() => {
    const secretKeys = new Set<string>();
    for (const h of getValues('headers') ?? []) {
      const k = (h.key ?? '').trim();
      if (k && h.isSecret) {
        secretKeys.add(k);
      }
    }
    return secretKeys;
  });

  // Handle dialog reuse: when the form is reset for a different server,
  // all field IDs change. Detect this and recompute initial secret keys.
  const previousFieldIdsRef = useRef(fields.map((f) => f.id).join(','));
  useEffect(() => {
    const currentFieldIds = fields.map((f) => f.id).join(',');
    if (currentFieldIds === previousFieldIdsRef.current) {
      return;
    }

    if (fields.length > 0) {
      const currentIds = new Set(fields.map((f) => f.id));
      const prevIds = previousFieldIdsRef.current.split(',').filter(Boolean);
      const isFullReset = prevIds.length > 0 && prevIds.every((id) => !currentIds.has(id));

      if (isFullReset) {
        const secretKeys = new Set<string>();
        fields.forEach((f) => {
          const key = ((f as { key?: string }).key ?? '').trim();
          const isSecret = !!(f as { isSecret?: boolean }).isSecret;
          if (key && isSecret) {
            secretKeys.add(key);
          }
        });
        setInitialSecretKeys(secretKeys);
      }
    } else if (previousFieldIdsRef.current !== '') {
      setInitialSecretKeys(new Set());
    }

    previousFieldIdsRef.current = currentFieldIds;
  }, [fields]);

  const availableVars =
    useWatch<MCPServerFormData, 'customUserVars'>({
      control,
      name: 'customUserVars',
    }) ?? [];

  const validVars = useMemo(
    () => availableVars.filter((v) => v.key.trim() && v.title.trim()),
    [availableVars],
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{localize('com_ui_mcp_headers')}</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => append({ key: '', value: '', isSecret: false })}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3" aria-hidden="true" />
          {localize('com_ui_mcp_add_header')}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-light px-3 py-2 text-center text-xs text-text-secondary">
          {localize('com_ui_mcp_no_headers')}
        </p>
      ) : (
        <div className="space-y-2 rounded-lg border border-border-light p-3">
          {fields.map((field, index) => (
            <HeaderRow
              key={field.id}
              index={index}
              onRemove={() => remove(index)}
              availableVars={validVars}
              isEditMode={isEditMode}
              initialSecretHeaderKeys={initialSecretKeys}
            />
          ))}
        </div>
      )}
    </div>
  );
}
