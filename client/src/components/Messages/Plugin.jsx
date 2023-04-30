
import React, { useState } from 'react'
import Spinner from '../svg/Spinner';
import { Disclosure } from '@headlessui/react'
import { cn } from '~/utils/';

export default function Plugin({ }) {
  const [loading, setLoading] = useState(false);
  return (
      <Disclosure>
        <Disclosure.Button className="py-2">
          Is team pricing available?
        </Disclosure.Button>
        <Disclosure.Panel className="text-gray-500">
          Yes! You can purchase a license that you can share with your entire
          team.
        </Disclosure.Panel>
      </Disclosure>
  )
}


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
</div>;
