import React from 'react';
import { SettingGroup } from '../constants';
import SettingToggle from './SettingToggle';
import SettingText from './SettingText';
import { AgentCapabilities } from './AgentCapabilities';

interface SettingsSectionProps {
  group: SettingGroup;
  values: Record<string, unknown>;
  saving: boolean;
  onUpdateSetting: (key: string, value: unknown) => void;
}

export const SettingsSection: React.FC<SettingsSectionProps> = ({
  group,
  values,
  saving,
  onUpdateSetting,
}) => {
  return (
    <section id={group.id} className="mb-8">
      <div className="mb-6">
        <div className="flex items-center mb-2">
          <group.icon className="w-5 h-5" />
          <h2 className="text-xl font-semibold ml-3">{group.title}</h2>
        </div>
        <p className="text-sm text-gray-600 m-0 leading-6">{group.description}</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {group.settings.map((setting) => {
          const isNested = !!setting.parentKey;
          if (isNested) {
            const parentVal = values[setting.parentKey as string];
            if (parentVal === false) {
              return null;
            }
          }
          const current = values[setting.key] ?? setting.defaultValue;

          const containerClass = isNested ? 'ml-4 pl-6 border-l border-gray-200 dark:border-gray-700' : '';

          if (setting.type === 'boolean') {
            return (
              <div className={containerClass} key={setting.key}>
                <SettingToggle
                key={setting.key}
                label={setting.label}
                description={setting.description}
                value={Boolean(current)}
                disabled={saving}
                onChange={(v) => onUpdateSetting(setting.key, v)}
              />
              </div>
            );
          }

          if (['text', 'textarea', 'url', 'number'].includes(setting.type)) {
            return (
              <div className={containerClass} key={setting.key}>
              <SettingText
                key={setting.key}
                label={setting.label}
                description={setting.description}
                type={
                  setting.type === 'number' ? 'text' : (setting.type as 'text' | 'textarea' | 'url')
                }
                value={String(current)}
                placeholder={setting.placeholder}
                disabled={saving}
                onBlur={(v) =>
                  onUpdateSetting(
                    setting.key,
                    setting.type === 'number' ? Number(v) : v,
                  )
                }
              />
              </div>
            );
          }

          if (setting.type === 'capabilities') {
            return (
              <div className={containerClass} key={setting.key}>
                <AgentCapabilities
                  label={setting.label}
                  description={setting.description}
                  value={Array.isArray(current) ? current : []}
                  disabled={saving}
                  onChange={(v) => onUpdateSetting(setting.key, v)}
                />
              </div>
            );
          }

          return null;
        })}
      </div>
    </section>
  );
}; 