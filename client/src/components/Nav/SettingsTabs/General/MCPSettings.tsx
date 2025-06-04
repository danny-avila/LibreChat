import React, { useState, useCallback } from 'react';
import { ShieldEllipsis, ExternalLink } from 'lucide-react';
import { Switch } from '~/components/ui';
import { useLocalize, useAuthContext } from '~/hooks';
import { SystemRoles } from 'librechat-data-provider';
import { useToastContext } from '~/Providers';

interface MCPServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  description: string;
}

const MCPSettings = () => {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const { showToast } = useToastContext();

  // Состояние MCP серверов (пока что локальное, позже можно подключить к API)
  const [mcpServers, setMcpServers] = useState<MCPServerConfig[]>([
    {
      id: 'puppeteer',
      name: 'Puppeteer MCP',
      enabled: true,
      description: 'Web automation and screenshot tool using Puppeteer. Allows AI to take screenshots and read web pages.',
    },
  ]);

  const toggleServer = useCallback((serverId: string) => {
    setMcpServers(prev => 
      prev.map(server => 
        server.id === serverId 
          ? { ...server, enabled: !server.enabled }
          : server
      )
    );
    
    showToast({ 
      status: 'success', 
      message: localize('com_ui_saved') 
    });
  }, [showToast, localize]);

  if (user?.role !== SystemRoles.ADMIN) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 p-4 border border-border-light rounded-lg bg-surface-primary">
      <div className="flex items-center gap-2">
        <ShieldEllipsis className="icon-sm" />
        <h3 className="font-medium text-text-primary">
          {localize('com_ui_mcp_settings')}
        </h3>
      </div>
      
      <div className="text-sm text-text-secondary">
        {localize('com_ui_mcp_settings_description')}
      </div>

      <div className="space-y-3">
        {mcpServers.map((server) => (
          <div key={server.id} className="flex items-start justify-between gap-4 p-3 border border-border-medium rounded-lg">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-text-primary">{server.name}</span>
              </div>
              <p className="text-sm text-text-secondary">{server.description}</p>
              {server.id === 'puppeteer' && (
                <div className="mt-2 text-xs text-text-tertiary">
                  <span>Доступные команды: </span>
                  <span className="font-mono bg-surface-secondary px-1 rounded">
                    "Сделай скриншот google.com"
                  </span>
                  <span>, </span>
                  <span className="font-mono bg-surface-secondary px-1 rounded">
                    "Прочитай содержимое сайта example.com"
                  </span>
                </div>
              )}
            </div>
            
            <Switch
              checked={server.enabled}
              onCheckedChange={() => toggleServer(server.id)}
              className="ml-4"
            />
          </div>
        ))}
      </div>

      <div className="text-xs text-text-tertiary">
        <span>Изменения применяются к конфигурации </span>
        <span className="font-mono bg-surface-secondary px-1 rounded">librechat.yaml</span>
        <span>. Требуется перезапуск сервера для полного применения.</span>
      </div>
    </div>
  );
};

export default MCPSettings; 