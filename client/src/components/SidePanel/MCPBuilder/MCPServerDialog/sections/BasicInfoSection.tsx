import { useFormContext } from 'react-hook-form';
import { Input, Label, Textarea } from '@librechat/client';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';
import MCPIcon from '~/components/SidePanel/Agents/MCPIcon';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function BasicInfoSection() {
  const localize = useLocalize();
  const {
    register,
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<MCPServerFormData>();

  const iconValue = watch('icon');

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setValue('icon', base64String);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="space-y-3">
      {/* Icon + Name row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="flex-shrink-0">
          <MCPIcon icon={iconValue} onIconChange={handleIconChange} />
        </div>
        <div className="w-full space-y-1.5 sm:flex-1">
          <Label htmlFor="mcp-title" className="text-sm font-medium">
            {localize('com_ui_name')}{' '}
            <span aria-hidden="true" className="text-text-secondary">
              *
            </span>
            <span className="sr-only">{localize('com_ui_field_required')}</span>
          </Label>
          <Input
            id="mcp-title"
            autoComplete="off"
            placeholder={localize('com_agents_mcp_name_placeholder')}
            aria-invalid={errors.title ? 'true' : 'false'}
            aria-describedby={errors.title ? 'mcp-title-error' : undefined}
            {...register('title', {
              required: localize('com_ui_field_required'),
              pattern: {
                value: /^[a-zA-Z0-9 ]+$/,
                message: localize('com_ui_mcp_title_invalid'),
              },
            })}
            className={cn(errors.title && 'border-border-destructive')}
          />
          {errors.title && (
            <p id="mcp-title-error" role="alert" className="text-xs text-text-destructive">
              {errors.title.message}
            </p>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <Label htmlFor="mcp-description" className="text-sm font-medium">
          {localize('com_ui_description')}{' '}
          <span className="text-xs text-text-secondary">{localize('com_ui_optional')}</span>
        </Label>
        <Textarea
          id="mcp-description"
          placeholder={localize('com_agents_mcp_description_placeholder')}
          {...register('description')}
        />
      </div>
    </div>
  );
}
