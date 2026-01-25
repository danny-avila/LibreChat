import { useFormContext } from 'react-hook-form';
import { Input, Label } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import { isValidUrl, normalizeUrl } from '../utils/urlUtils';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

export default function ConnectionSection() {
  const localize = useLocalize();
  const {
    register,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  return (
    <div className="space-y-1.5">
      <Label htmlFor="url" className="text-sm font-medium">
        {localize('com_ui_mcp_url')} <span className="text-text-secondary">*</span>
      </Label>
      <Input
        id="url"
        type="url"
        autoComplete="off"
        placeholder={localize('com_ui_mcp_server_url_placeholder')}
        {...register('url', {
          required: localize('com_ui_field_required'),
          validate: (value) => {
            const normalized = normalizeUrl(value);
            return isValidUrl(normalized) || localize('com_ui_mcp_invalid_url');
          },
        })}
        className={cn(errors.url && 'border-red-500 focus:border-red-500')}
      />
      {errors.url && <p className="text-xs text-red-500">{errors.url.message}</p>}
    </div>
  );
}
