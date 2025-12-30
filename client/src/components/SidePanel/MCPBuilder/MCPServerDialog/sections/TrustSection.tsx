import { useFormContext, Controller } from 'react-hook-form';
import { Checkbox, Label } from '@librechat/client';
import { useLocalize, useLocalizedConfig } from '~/hooks';
import { useGetStartupConfig } from '~/data-provider';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

export default function TrustSection() {
  const localize = useLocalize();
  const { data: startupConfig } = useGetStartupConfig();
  const getLocalizedValue = useLocalizedConfig();
  const {
    control,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  return (
    <div className="rounded-lg border border-border-light bg-surface-secondary p-2">
      <div className="flex items-start gap-3">
        <Controller
          name="trust"
          control={control}
          rules={{ required: true }}
          render={({ field }) => (
            <Checkbox
              id="trust"
              checked={field.value}
              onCheckedChange={field.onChange}
              aria-labelledby="trust-label"
              aria-describedby="trust-description"
              className="mt-0.5"
            />
          )}
        />
        <Label
          id="trust-label"
          htmlFor="trust"
          className="flex cursor-pointer flex-col gap-0.5 text-sm"
        >
          <span className="font-medium text-text-primary">
            {startupConfig?.interface?.mcpServers?.trustCheckbox?.label ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: getLocalizedValue(
                    startupConfig.interface.mcpServers.trustCheckbox.label,
                    localize('com_ui_trust_app'),
                  ),
                }}
              />
            ) : (
              localize('com_ui_trust_app')
            )}{' '}
            <span className="text-text-secondary">*</span>
          </span>
          <span id="trust-description" className="text-xs font-normal text-text-secondary">
            {startupConfig?.interface?.mcpServers?.trustCheckbox?.subLabel ? (
              <span
                dangerouslySetInnerHTML={{
                  __html: getLocalizedValue(
                    startupConfig.interface.mcpServers.trustCheckbox.subLabel,
                    localize('com_agents_mcp_trust_subtext'),
                  ),
                }}
              />
            ) : (
              localize('com_agents_mcp_trust_subtext')
            )}
          </span>
        </Label>
      </div>
      {errors.trust && (
        <p className="mt-2 text-xs text-red-500">{localize('com_ui_field_required')}</p>
      )}
    </div>
  );
}
