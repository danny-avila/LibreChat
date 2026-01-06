import { useFormContext } from 'react-hook-form';
import { Input, Label, TextareaAutosize } from '@librechat/client';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';
import MCPIcon from '~/components/SidePanel/Agents/MCPIcon';
import type { MCPServerFormData } from '../hooks/useMCPServerForm';

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
          <Label htmlFor="title" className="text-sm font-medium">
            {localize('com_ui_name')} <span className="text-text-secondary">*</span>
          </Label>
          <Input
            id="title"
            autoComplete="off"
            placeholder={localize('com_agents_mcp_name_placeholder')}
            {...register('title', {
              required: localize('com_ui_field_required'),
              pattern: {
                value: /^[a-zA-Z0-9 ]+$/,
                message: localize('com_ui_mcp_title_invalid'),
              },
            })}
            className={cn(errors.title && 'border-red-500 focus:border-red-500')}
          />
          {errors.title && <p className="text-xs text-red-500">{errors.title.message}</p>}
        </div>
      </div>

      {/* Description - always visible, full width */}
      <div className="space-y-1.5">
        <Label htmlFor="description" className="text-sm font-medium">
          {localize('com_ui_description')}{' '}
          <span className="text-xs text-text-secondary">{localize('com_ui_optional')}</span>
        </Label>
        <TextareaAutosize
          id="description"
          aria-label={localize('com_ui_description')}
          placeholder={localize('com_agents_mcp_description_placeholder')}
          {...register('description')}
          minRows={2}
          maxRows={4}
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
        />
      </div>
    </div>
  );
}
