import { Disclosure } from '@headlessui/react';
import { useCallback, memo, ReactNode } from 'react';
import { useGetEndpointsQuery } from 'librechat-data-provider/react-query';
import type { TResPlugin, TInput } from 'librechat-data-provider';
import { ChevronDownIcon, LucideProps } from 'lucide-react';
import { cn, formatJSON } from '~/utils';
import { Spinner } from '~/components';
import CodeBlock from './CodeBlock';

type PluginIconProps = LucideProps & {
  className?: string;
};

function formatInputs(inputs: TInput[]) {
  let output = '';

  for (let i = 0; i < inputs.length; i++) {
    const input = formatJSON(`${inputs[i]?.inputStr ?? inputs[i]}`);
    output += input;

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
  const { data: plugins = {} } = useGetEndpointsQuery({
    select: (data) => data?.gptPlugins?.plugins,
  });

  const getPluginName = useCallback(
    (pluginKey: string) => {
      if (!pluginKey) {
        return null;
      }

      if (pluginKey === 'n/a' || pluginKey === 'self reflection') {
        return pluginKey;
      }
      return plugins?.[pluginKey] ?? 'self reflection';
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
                  plugin.loading ? 'bg-green-100' : 'bg-gray-20',
                  'my-1 flex items-center rounded p-3 text-xs text-gray-800',
                )}
              >
                <div>
                  <div className="flex items-center gap-3">
                    <div>{generateStatus()}</div>
                  </div>
                </div>
                {plugin.loading && <Spinner className="ml-1 text-black" />}
                <Disclosure.Button className="ml-12 flex items-center gap-2">
                  <ChevronDownIcon {...iconProps} />
                </Disclosure.Button>
              </div>

              <Disclosure.Panel className="my-3 flex max-w-full flex-col gap-3">
                <CodeBlock
                  lang={latestPlugin ? `REQUEST TO ${latestPlugin?.toUpperCase()}` : 'REQUEST'}
                  codeChildren={formatInputs(plugin.inputs ?? [])}
                  plugin={true}
                  classProp="max-h-[450px]"
                />
                {plugin.outputs && plugin.outputs.length > 0 && (
                  <CodeBlock
                    lang={
                      latestPlugin ? `RESPONSE FROM ${latestPlugin?.toUpperCase()}` : 'RESPONSE'
                    }
                    codeChildren={formatJSON(plugin.outputs ?? '')}
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
