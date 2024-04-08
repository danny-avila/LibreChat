import React, { useState } from 'react';
import ArrowDownIcon from '~/components/svg/ArrowDownIcon';
import ArrowUpIcon from '~/components/svg/ArrowUpIcon';

export default function SubDetailsExplain() {
  const [open, setOpen] = useState<boolean>(false);
  return (
    <div className="rounded-md bg-gray-100 p-5 dark:bg-gray-700">
      <button className="flex items-center gap-3" onClick={() => setOpen(!open)}>
        <p className="text-[18px] font-bold">What&apos;s included</p>
        {open ? (
          <ArrowUpIcon className="dark:fill-white" />
        ) : (
          <ArrowDownIcon className="dark:fill-white" />
        )}
      </button>
      {open && (
        <div className="pl-4 transition">
          <div className="pl-6 transition">
            <ul className="list-disc">
              <li>Enjoy exclusive access to GPT-4 and Claude-3-Opus</li>
              <li>Accept crypto tips from the ChatG Community</li>
              <li>
                Use your credits on the bots you want. For instance, with 2000 credits, you have the
                capacity to produce 2000 images using Stable Diffusion
              </li>
              <li>Benefit from faster responses with popular bots</li>
              <li>
                Get early access to new features, including experimental bots like ChatGPT-16k, and
                GPT-4-32k
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
