import { useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { Plus, Trash2, CirclePlus } from 'lucide-react';
import * as Menu from '@ariakit/react/menu';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '~/components/ui/Accordion';
import { DropdownPopup } from '~/components/ui';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

interface UserInfoPlaceholder {
  label: string;
  value: string;
  description: string;
}

const userInfoPlaceholders: UserInfoPlaceholder[] = [
  { label: 'user-id', value: '{{LIBRECHAT_USER_ID}}', description: 'Current user ID' },
  { label: 'username', value: '{{LIBRECHAT_USER_USERNAME}}', description: 'Current username' },
  { label: 'email', value: '{{LIBRECHAT_USER_EMAIL}}', description: 'Current user email' },
  { label: 'name', value: '{{LIBRECHAT_USER_NAME}}', description: 'Current user name' },
  {
    label: 'provider',
    value: '{{LIBRECHAT_USER_PROVIDER}}',
    description: 'Authentication provider',
  },
  { label: 'role', value: '{{LIBRECHAT_USER_ROLE}}', description: 'User role' },
];

export default function MCPAuth() {
  const localize = useLocalize();
  const { register, watch, setValue } = useFormContext();
  const [isHeadersMenuOpen, setIsHeadersMenuOpen] = useState(false);

  const customHeaders = watch('customHeaders') || [];
  const requestTimeout = watch('requestTimeout') || '';
  const connectionTimeout = watch('connectionTimeout') || '';

  const addCustomHeader = () => {
    const newHeader = {
      id: Date.now().toString(),
      name: '',
      value: '',
    };
    setValue('customHeaders', [...customHeaders, newHeader]);
  };

  const removeCustomHeader = (id: string) => {
    setValue(
      'customHeaders',
      customHeaders.filter((header: any) => header.id !== id),
    );
  };

  const updateCustomHeader = (id: string, field: 'name' | 'value', value: string) => {
    setValue(
      'customHeaders',
      customHeaders.map((header: any) =>
        header.id === id ? { ...header, [field]: value } : header,
      ),
    );
  };

  const handleAddPlaceholder = (placeholder: UserInfoPlaceholder) => {
    const newHeader = {
      id: Date.now().toString(),
      name: placeholder.label,
      value: placeholder.value,
    };
    setValue('customHeaders', [...customHeaders, newHeader]);
    setIsHeadersMenuOpen(false);
  };

  const headerMenuItems = [
    ...userInfoPlaceholders.map((placeholder) => ({
      label: `${placeholder.label} - ${placeholder.description}`,
      onClick: () => handleAddPlaceholder(placeholder),
    })),
  ];

  return (
    <div className="space-y-4">
      {/* Authentication Accordion */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="authentication" className="rounded-lg border border-border-medium">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
            {localize('com_ui_authentication')}
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Custom Headers Section - Individual Inputs Version */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <label className="text-sm font-medium text-text-primary">
                    {localize('com_ui_mcp_custom_headers')}
                  </label>
                  <DropdownPopup
                    menuId="headers-menu"
                    items={headerMenuItems}
                    isOpen={isHeadersMenuOpen}
                    setIsOpen={setIsHeadersMenuOpen}
                    trigger={
                      <Menu.MenuButton
                        onClick={() => setIsHeadersMenuOpen(!isHeadersMenuOpen)}
                        className="flex h-7 items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-xs text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
                      >
                        <CirclePlus className="mr-1 h-3 w-3 text-text-secondary" />
                        {localize('com_ui_mcp_headers')}
                      </Menu.MenuButton>
                    }
                  />
                </div>

                <div className="space-y-2">
                  {customHeaders.length === 0 ? (
                    <div className="flex items-center justify-between gap-2">
                      <p className="min-w-0 flex-1 text-sm text-text-secondary">
                        {localize('com_ui_mcp_no_custom_headers')}
                      </p>
                      <button
                        type="button"
                        onClick={addCustomHeader}
                        className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-xs text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
                      >
                        <Plus className="h-3 w-3" />
                        {localize('com_ui_mcp_add_header')}
                      </button>
                    </div>
                  ) : (
                    <>
                      {customHeaders.map((header: any) => (
                        <div key={header.id} className="flex min-w-0 gap-2">
                          <input
                            type="text"
                            placeholder={localize('com_ui_mcp_header_name')}
                            value={header.name}
                            onChange={(e) => updateCustomHeader(header.id, 'name', e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <input
                            type="text"
                            placeholder={localize('com_ui_mcp_header_value')}
                            value={header.value}
                            onChange={(e) => updateCustomHeader(header.id, 'value', e.target.value)}
                            className="min-w-0 flex-1 rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button
                            type="button"
                            onClick={() => removeCustomHeader(header.id)}
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-medium bg-surface-primary text-text-secondary hover:bg-surface-secondary hover:text-text-primary"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      {/* Add New Header Button */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={addCustomHeader}
                          className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-xs text-text-primary transition-colors duration-200 hover:bg-surface-tertiary"
                        >
                          <Plus className="h-3 w-3" />
                          {localize('com_ui_mcp_add_header')}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Configuration Accordion */}
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="configuration" className="rounded-lg border border-border-medium">
          <AccordionTrigger className="px-4 py-3 text-sm font-medium hover:no-underline">
            {localize('com_ui_mcp_configuration')}
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <div className="space-y-4">
              {/* Request Timeout */}
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">
                  {localize('com_ui_mcp_request_timeout')}
                </label>
                <input
                  type="number"
                  min="1000"
                  max="300000"
                  placeholder="10000"
                  {...register('requestTimeout')}
                  className="h-9 w-full rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  {localize('com_ui_mcp_request_timeout_description')}
                </p>
              </div>

              {/* Connection Timeout */}
              <div>
                <label className="mb-2 block text-sm font-medium text-text-primary">
                  {localize('com_ui_mcp_connection_timeout')}
                </label>
                <input
                  type="number"
                  min="1000"
                  max="60000"
                  placeholder="10000"
                  {...register('connectionTimeout')}
                  className="h-9 w-full rounded-md border border-border-medium bg-surface-primary px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <p className="mt-1 text-xs text-text-secondary">
                  {localize('com_ui_mcp_connection_timeout_description')}
                </p>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
