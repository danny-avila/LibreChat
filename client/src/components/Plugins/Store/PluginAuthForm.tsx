import { Save } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { HoverCard, HoverCardTrigger } from '@librechat/client';
import {
  TPlugin,
  TPluginAuthConfig,
  TPluginAction,
  SENSITIVE_FIELD_REDACTED,
} from 'librechat-data-provider';
import PluginTooltip from './PluginTooltip';
import { useLocalize } from '~/hooks';

type TPluginAuthFormProps = {
  plugin: TPlugin | undefined;
  onSubmit: (installActionData: TPluginAction) => void;
  isEntityTool?: boolean;
  initialValues?: Record<string, string>;
};

function PluginAuthForm({
  plugin,
  onSubmit,
  isEntityTool,
  initialValues = {},
}: TPluginAuthFormProps) {
  const localize = useLocalize();
  const authConfig = useMemo(() => plugin?.authConfig ?? [], [plugin?.authConfig]);

  // Process initialValues: replace masked placeholders with empty strings for sensitive fields
  const processedInitialValues = useMemo(() => {
    const processed: Record<string, string> = {};
    authConfig.forEach((config) => {
      const authField = config.authField.split('||')[0];
      const isSensitive = config.sensitive ?? false;
      const value = initialValues[authField];

      // For sensitive fields, if value is the masked placeholder, set to empty string
      // This ensures the input is empty but we know a value exists (via placeholder)
      if (isSensitive && value === SENSITIVE_FIELD_REDACTED) {
        processed[authField] = '';
      } else {
        processed[authField] = value || '';
      }
    });
    return processed;
  }, [initialValues, authConfig]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isValid, isSubmitting },
  } = useForm({
    defaultValues: processedInitialValues,
  });

  // Track previous initialValues to only reset when they actually change
  const prevInitialValuesRef = useRef<string>('');
  const initialValuesKey = JSON.stringify(initialValues);

  useEffect(() => {
    // Only reset if initialValues prop actually changed (not on every render or when user types)
    if (prevInitialValuesRef.current !== initialValuesKey) {
      prevInitialValuesRef.current = initialValuesKey;
      // Only reset if we have initial values (for edit mode), otherwise let user type freely
      if (Object.keys(initialValues).length > 0) {
        reset(processedInitialValues);
      }
    }
  }, [initialValuesKey, processedInitialValues, reset, initialValues]);

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="w-full">
        <form
          className="flex w-full flex-col items-start justify-start gap-2"
          method="POST"
          onSubmit={handleSubmit((auth) =>
            onSubmit({
              pluginKey: plugin?.pluginKey ?? '',
              action: 'install',
              auth,
              isEntityTool,
            }),
          )}
        >
          {authConfig.map((config: TPluginAuthConfig, i: number) => {
            const authField = config.authField.split('||')[0];
            const isOptional = config.optional ?? false;
            const isSensitive = config.sensitive ?? false;
            // Check if a value exists (for sensitive fields, this will be the masked placeholder)
            const hasExistingValue =
              initialValues[authField] !== undefined && initialValues[authField] !== '';
            // For sensitive fields with existing values, show masked placeholder
            const placeholder =
              isSensitive &&
              hasExistingValue &&
              initialValues[authField] === SENSITIVE_FIELD_REDACTED
                ? SENSITIVE_FIELD_REDACTED
                : undefined;

            return (
              <div key={`${authField}-${i}`} className="flex w-full flex-col gap-1">
                <label
                  htmlFor={authField}
                  className="mb-1 text-left text-sm font-medium text-gray-700/70 dark:text-gray-50/70"
                >
                  {config.label}
                  {isOptional && (
                    <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                      {localize('com_ui_optional')}
                    </span>
                  )}
                </label>
                <HoverCard openDelay={300}>
                  <HoverCardTrigger className="grid w-full items-center gap-2">
                    <input
                      type="text"
                      autoComplete="off"
                      id={authField}
                      aria-invalid={!!errors[authField]}
                      aria-describedby={`${authField}-error`}
                      aria-label={config.label}
                      aria-required={!isOptional}
                      {...(isSensitive && placeholder ? { placeholder } : {})}
                      {...register(authField, {
                        // For sensitive fields with existing values, make them optional to allow skipping updates
                        required:
                          isOptional || (isSensitive && hasExistingValue)
                            ? false
                            : `${config.label} is required.`,
                        ...(isOptional || (isSensitive && hasExistingValue)
                          ? {}
                          : {
                              minLength: {
                                value: 1,
                                message: `${config.label} must be at least 1 character long`,
                              },
                            }),
                      })}
                      className="flex h-10 max-h-10 w-full resize-none rounded-md border border-gray-200 bg-transparent px-3 py-2 text-sm text-gray-700 shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:border-gray-400 focus:bg-gray-50 focus:outline-none focus:ring-0 focus:ring-gray-400 focus:ring-opacity-0 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 focus:dark:bg-gray-600 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0"
                    />
                  </HoverCardTrigger>
                  <PluginTooltip content={config.description} position="right" />
                </HoverCard>
                {errors[authField] && (
                  <span role="alert" className="mt-1 text-sm text-red-400">
                    {errors[authField].message as string}
                  </span>
                )}
              </div>
            );
          })}
          <button
            disabled={!isDirty || !isValid || isSubmitting}
            type="button"
            className="btn btn-primary relative"
            onClick={() => {
              handleSubmit((auth) =>
                onSubmit({
                  pluginKey: plugin?.pluginKey ?? '',
                  action: 'install',
                  auth,
                  isEntityTool,
                }),
              )();
            }}
          >
            <div className="flex items-center justify-center gap-2">
              {localize('com_ui_save')}
              <Save className="flex h-4 w-4 items-center stroke-2" />
            </div>
          </button>
        </form>
      </div>
    </div>
  );
}

export default PluginAuthForm;
