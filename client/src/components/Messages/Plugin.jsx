import React, { useState } from 'react';
import Spinner from '../svg/Spinner';
import CodeBlock from './Content/CodeBlock.jsx';
import { Disclosure } from '@headlessui/react';
import { ChevronDownIcon } from 'lucide-react';
import { cn } from '~/utils/';

function formatInputs(inputs) {
  let output = '';

  for (let i = 0; i < inputs.length; i++) {
    output += `${inputs[i].inputStr}`;

    if (inputs.length > 1 && i !== inputs.length - 1) {
      output += ',\n';
    }
  }

  return output;
}

export default function Plugin({ plugin }) {
  const [loading, setLoading] = useState(plugin.loading);
  const finished = plugin.outputs && plugin.outputs.length > 0;

  if (!plugin.latest || (plugin.latest && plugin.latest.toLowerCase() === 'n/a')) {
    return null;
  }

  if (finished && loading) {
    setLoading(false);
  }

  const generateStatus = () => {
    if (!loading && plugin.latest === 'Self Reflection') {
      return 'Finished';
    } else if (plugin.latest === 'Self Reflection') {
      return "I'm  thinking...";
    } else {
      return (
        <>
          {loading ? 'Using' : 'Used'} <b>{plugin.latest}</b>
          {loading ? '...' : ''}
        </>
      );
    }
  };

  return (
    <div className="flex flex-col items-start">
      <Disclosure>
        {({ open }) => (
          <>
            <div
              className={cn(
                loading ? 'bg-green-100' : 'bg-[#ECECF1]',
                'flex items-center rounded p-3 text-sm text-gray-900'
              )}
            >
              <div>
                <div className="flex items-center gap-3">
                  <div>{generateStatus()}</div>
                </div>
              </div>
              {loading && <Spinner classProp="ml-1" />}
              <Disclosure.Button className="ml-12 flex items-center gap-2">
                <ChevronDownIcon className={cn(open ? 'rotate-180 transform' : '', 'h-4 w-4')} />
              </Disclosure.Button>
            </div>

            <Disclosure.Panel className="my-3 flex max-w-full flex-col gap-3">
              <CodeBlock
                lang={plugin.latest?.toUpperCase() || 'INPUTS'}
                codeChildren={formatInputs(plugin.inputs)}
                plugin={true}
                classProp="max-h-[450px]"
              />
              {finished && (
                <CodeBlock
                  lang="OUTPUTS"
                  codeChildren={plugin.outputs}
                  plugin={true}
                  classProp="max-h-[450px]"
                />
              )}
            </Disclosure.Panel>
          </>
        )}
      </Disclosure>
    </div>
  );
}
