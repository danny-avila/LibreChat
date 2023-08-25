import { useCallback, memo, ReactNode } from 'react';
import type { TResPlugin, TInput } from 'librechat-data-provider';
import { ChevronDownIcon, LucideProps } from 'lucide-react';
import { Disclosure } from '@headlessui/react';
import { useRecoilValue } from 'recoil';
import { Spinner } from '~/components';
import CodeBlock from './CodeBlock';
import { cn } from '~/utils/';
import store from '~/store';

type PluginsMap = {
  [pluginKey: string]: string;
};

type PluginIconProps = LucideProps & {
  className?: string;
};

function formatInputs(inputs: TInput[]) {
  let output = '';

  for (let i = 0; i < inputs.length; i++) {
    output += `${inputs[i].inputStr}`;

    if (inputs.length > 1 && i !== inputs.length - 1) {
      output += ',\n';
    }
  }

  return output;
}

type PluginProps = {
  plugin: TResPlugin;
};

const Plugin: React.FC<PluginProps> = ({ plugin }) => {
  const plugins: PluginsMap = useRecoilValue(store.plugins);

  const getPluginName = useCallback(
    (pluginKey: string) => {
      if (!pluginKey) {
        return null;
      }

      if (pluginKey === 'n/a' || pluginKey === 'self reflection') {
        return pluginKey;
      }
      return plugins[pluginKey] ?? 'self reflection';
    },
    [plugins],
  );

  if (!plugin || !plugin.latest) {
    return null;
  }

  const latestPlugin = getPluginName(plugin.latest);

  if (!latestPlugin || (latestPlugin && latestPlugin === 'n/a')) {
    return null;
  }

  const generateStatus = (): ReactNode => {
    if (!plugin.loading && latestPlugin === 'self reflection') {
      return 'Finished';
    } else if (latestPlugin === 'self reflection') {
      return 'I\'m  thinking...';
    } else {
      return (
        <>
          {plugin.loading ? 'Using' : 'Used'} <b>{latestPlugin}</b>
          {plugin.loading ? '...' : ''}
        </>
      );
    }
  };

  return (
    <div className="flex flex-col items-start">
      <Disclosure>
        {({ open }) => {
          const iconProps: PluginIconProps = {
            className: cn(open ? 'rotate-180 transform' : '', 'h-4 w-4'),
          };
          return (
            <>
              <div
                className={cn(
                  plugin.loading ? 'bg-green-100' : 'bg-[#ECECF1]',
                  'flex items-center rounded p-3 text-sm text-gray-900',
                )}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <div>{generateStatus()}</div>
                  </div>
                </div>
                {plugin.loading && <Spinner className="ml-1" />}
                <Disclosure.Button className="ml-12 flex items-center gap-2">
                  <ChevronDownIcon {...iconProps} />
                </Disclosure.Button>
              </div>

              <Disclosure.Panel className="my-3 flex max-w-full flex-col gap-3">
                <CodeBlock
                  lang={latestPlugin?.toUpperCase() || 'INPUTS'}
                  codeChildren={formatInputs(plugin.inputs ?? [])}
                  plugin={true}
                  classProp="max-h-[450px]"
                />
                {plugin.outputs && plugin.outputs.length > 0 && (
                  <CodeBlock
                    lang="OUTPUTS"
                    codeChildren={plugin.outputs ?? ''}
                    plugin={true}
                    classProp="max-h-[450px]"
                  />
                )}
              </Disclosure.Panel>
            </>
          );
        }}
      </Disclosure>
    </div>
  );
};

export default memo(Plugin);
