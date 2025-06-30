import { useState, useEffect } from 'react';
import { Constants } from 'librechat-data-provider';
import { useFormContext, Controller } from 'react-hook-form';
import type { MCP, MCPMetadata } from 'librechat-data-provider';
import { MCPConfig } from '~/components/SidePanel/MCP/MCPConfig';
import MCPIcon from '~/components/SidePanel/Agents/MCPIcon';
import { Label, Checkbox } from '~/components/ui';
import useLocalize from '~/hooks/useLocalize';
import { Spinner } from '~/components/svg';
import { MCPForm } from '~/common/types';

interface MCPInputProps {
  mcp?: MCP;
  agent_id?: string;
  onSave: (mcp: MCP) => void;
  isLoading?: boolean;
}

export default function MCPInput({ mcp, agent_id = '', onSave, isLoading = false }: MCPInputProps) {
  const localize = useLocalize();
  const {
    handleSubmit,
    register,
    formState: { errors },
    control,
    setValue,
    getValues,
  } = useFormContext<MCPForm>();
  const [showTools, setShowTools] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>([]);

  // Initialize tools list if editing existing MCP
  useEffect(() => {
    if (mcp?.mcp_id && mcp.metadata.tools) {
      setShowTools(true);
      setSelectedTools(mcp.metadata.tools);
    }
  }, [mcp]);

  const saveMCP = handleSubmit(async (data: MCPForm) => {
    // Generate MCP ID using server name and delimiter for new MCPs
    const mcpId =
      mcp?.mcp_id || `${data.name.replace(/\s+/g, '_').toLowerCase()}${Constants.mcp_delimiter}`;

    const updatedMCP: MCP = {
      mcp_id: mcpId,
      agent_id: agent_id ?? '',
      metadata: {
        ...data,
        tools: selectedTools,
      } as MCPMetadata, // Type assertion since form validation ensures required fields
    };
    onSave(updatedMCP);
  });

  const handleSelectAll = () => {
    if (mcp?.metadata.tools) {
      setSelectedTools(mcp.metadata.tools);
    }
  };

  const handleDeselectAll = () => {
    setSelectedTools([]);
  };

  const handleToolToggle = (tool: string) => {
    setSelectedTools((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool],
    );
  };

  const handleToggleAll = () => {
    if (selectedTools.length === mcp?.metadata.tools?.length) {
      handleDeselectAll();
    } else {
      handleSelectAll();
    }
  };

  const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const updatedMCP: MCP = {
          mcp_id: mcp?.mcp_id ?? '',
          agent_id: agent_id ?? '',
          metadata: {
            ...mcp?.metadata,
            icon: base64String,
          },
        };
        onSave(updatedMCP);
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Icon Picker */}
      <div className="mb-4">
        <MCPIcon icon={mcp?.metadata.icon} onIconChange={handleIconChange} />
      </div>
      {/* name, description, url */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">{localize('com_ui_name')}</Label>
          <input
            id="name"
            {...register('name', { required: true })}
            className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
            placeholder={localize('com_agents_mcp_name_placeholder')}
          />
          {errors.name && (
            <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="description">
            {localize('com_ui_description')}
            <span className="ml-1 text-xs text-text-secondary-alt">
              {localize('com_ui_optional')}
            </span>
          </Label>
          <input
            id="description"
            {...register('description')}
            className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
            placeholder={localize('com_agents_mcp_description_placeholder')}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="url">{localize('com_ui_mcp_url')}</Label>
          <input
            id="url"
            {...register('url', {
              required: true,
            })}
            className="border-token-border-medium flex h-9 w-full rounded-lg border bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
            placeholder={'https://mcp.example.com'}
          />
          {errors.url && (
            <span className="text-xs text-red-500">
              {errors.url.type === 'required'
                ? localize('com_ui_field_required')
                : errors.url.message}
            </span>
          )}
        </div>
        <MCPConfig />
        <div className="my-2 flex items-center">
          <Controller
            name="trust"
            control={control}
            rules={{ required: true }}
            render={({ field }) => (
              <Checkbox
                {...field}
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
                className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                value={(field.value ?? false).toString()}
              />
            )}
          />
          <button
            type="button"
            className="flex items-center space-x-2"
            onClick={() =>
              setValue('trust', !getValues('trust'), {
                shouldDirty: true,
              })
            }
          >
            <label
              className="form-check-label text-token-text-primary w-full cursor-pointer"
              htmlFor="trust"
            >
              {localize('com_ui_trust_app')}
            </label>
          </button>
        </div>
        <div className="-mt-5 ml-6">
          <span className="text-xs text-text-secondary">
            {localize('com_agents_mcp_trust_subtext')}
          </span>
        </div>
        {errors.trust && (
          <div className="ml-6">
            <span className="text-xs text-red-500">{localize('com_ui_field_required')}</span>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end">
        <button
          onClick={saveMCP}
          disabled={isLoading}
          className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white transition-colors duration-200 hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:bg-green-400"
          type="button"
        >
          {(() => {
            if (isLoading) {
              return <Spinner className="icon-md" />;
            }
            return mcp?.mcp_id ? localize('com_ui_update') : localize('com_ui_create');
          })()}
        </button>
      </div>

      {showTools && mcp?.metadata.tools && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-token-text-primary block font-medium">
              {localize('com_ui_available_tools')}
            </h3>
            <button
              onClick={handleToggleAll}
              type="button"
              className="btn btn-neutral border-token-border-light relative h-8 rounded-full px-4 font-medium"
            >
              {selectedTools.length === mcp.metadata.tools.length
                ? localize('com_ui_deselect_all')
                : localize('com_ui_select_all')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {mcp.metadata.tools.map((tool) => (
              <label
                key={tool}
                htmlFor={tool}
                className="border-token-border-light hover:bg-token-surface-secondary flex cursor-pointer items-center rounded-lg border p-2"
              >
                <Checkbox
                  id={tool}
                  checked={selectedTools.includes(tool)}
                  onCheckedChange={() => handleToolToggle(tool)}
                  className="relative float-left mr-2 inline-flex h-4 w-4 cursor-pointer"
                />
                <span className="text-token-text-primary">
                  {tool
                    .split('_')
                    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ')}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
