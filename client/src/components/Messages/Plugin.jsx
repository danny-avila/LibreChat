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

  if (finished && loading) {
    setLoading(false);
  }

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
                  <div>
                    {loading ? 'Using' : 'Used'} <b>{plugin.latest || 'None'}</b>
                    {loading ? '...' : ''}
                  </div>
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
                classProp='max-h-[450px]'
              />
              {
                finished && (
                  <CodeBlock
                  lang="OUTPUTS"
                  codeChildren={plugin.outputs}
                  plugin={true}
                  classProp='max-h-[450px]'
                />
                )
              }
            </Disclosure.Panel>
          </>
        )}
      </Disclosure>
    </div>
  );
}

{
  /* 

<div class="flex items-center rounded bg-green-100 p-3 text-sm text-gray-900">
  <div>
    <div class="flex items-center gap-3">
      <div>
        Using <b>Wolfram</b>...
      </div>
    </div>
  </div>
<Spinner />
  <div
    class="ml-12 flex items-center gap-2"
    role="button"
  >
    <svg
      stroke="currentColor"
      fill="none"
      stroke-width="2"
      viewBox="0 0 24 24"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-4 w-4"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polyline points="18 15 12 9 6 15"></polyline>
    </svg>
  </div>
</div>; */
}
