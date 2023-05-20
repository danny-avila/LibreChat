import { TPlugin, TPluginAuthConfig } from '~/data-provider';
import { Input, Label, Button } from '~/components/ui';
import { cn } from '~/utils/';
import { useForm } from 'react-hook-form';
import { TPluginAction } from './PluginStoreDialog';

type TPluginAuthFormProps = {
  plugin: TPlugin;
  onSubmit: (installActionData: TPluginAction) => void;
};

const defaultTextProps =
  'rounded-md border border-gray-200 focus:border-slate-400 focus:bg-gray-50 bg-transparent text-sm shadow-[0_0_10px_rgba(0,0,0,0.05)] outline-none placeholder:text-gray-400 focus:outline-none focus:ring-gray-400 focus:ring-opacity-20 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-500 dark:bg-gray-700 focus:dark:bg-gray-600 dark:text-gray-50 dark:shadow-[0_0_15px_rgba(0,0,0,0.10)] dark:focus:border-gray-400 dark:focus:outline-none dark:focus:ring-0 dark:focus:ring-gray-400 dark:focus:ring-offset-0';

function PluginAuthForm({ plugin, onSubmit }: TPluginAuthFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty, isValid, isSubmitting }
  } = useForm();

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="grid w-full gap-6 sm:grid-cols-2">
        <form
          className="col-span-1 flex w-full flex-col items-start justify-start gap-2"
          method="POST"
          onSubmit={handleSubmit((data) =>
            onSubmit({ pluginKey: plugin.pluginKey, action: 'install', data })
          )}
        >
          {plugin.authConfig?.map((config: TPluginAuthConfig, i: number) => (
            <div key={`${config.name}-${i}`} className="flex w-full flex-col gap-1">
              <label htmlFor={config.name} className="mb-1 text-left text-sm font-medium">
                {config.label}
              </label>
              <input
                type="text"
                id={config.name}
                aria-invalid={!!errors[config.name]}
                aria-describedby={`${config.name}-error`}
                aria-label={config.label}
                aria-required="true"
                {...register(config.name, {
                  required: `${config.label} is required.`,
                  minLength: {
                    value: 10,
                    message: `${config.label} must be at least 10 characters long`
                  }
                })}
                className={cn(
                  defaultTextProps,
                  'flex h-10 max-h-10 w-full resize-none px-3 py-2 focus:outline-none focus:ring-0 focus:ring-opacity-0 focus:ring-offset-0'
                )}
              />
              {errors[config.name] && (
                <span role="alert" className="mt-1 text-sm text-red-400">
                  {/* @ts-ignore - Type 'string | FieldError | Merge<FieldError, FieldErrorsImpl<any>> | undefined' is not assignable to type 'ReactNode' */}
                  {errors[config.name].message}
                </span>
              )}
            </div>
          ))}
          <button
            disabled={!isDirty || !isValid || isSubmitting}
            type="submit"
            className="btn btn-primary relative"
          >
            Save
          </button>
        </form>
      </div>
    </div>
  );
}

export default PluginAuthForm;
