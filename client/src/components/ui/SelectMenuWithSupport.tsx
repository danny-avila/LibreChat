import { useState } from 'react';
import {Disclosure } from '@headlessui/react';
import {  ChevronDown } from 'lucide-react';
import {cn} from "~/utils";

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default function SelectMenuWithSupport({ section }) {
  const [open, setOpen] = useState(false);
  return (
      <Disclosure as="div" key={section.name} className="">
        {({ open }) => (
            <>
              <h3 className="flow-root">
                <Disclosure.Button className="flex w-full items-center justify-between bg-white dark:bg-gray-700 dark:text-white px-2 py-3 text-sm text-gray-400">
                  <span className="font-medium">{section.name}</span>
                  <span className="ml-6 flex items-center">
                    <ChevronDown
                        className={classNames(open ? '-rotate-180' : 'rotate-0', 'h-5 w-5 transform')}
                        aria-hidden="true"
                    />
                  </span>
                </Disclosure.Button>
              </h3>
              <Disclosure.Panel className="pt-6 absolute bg-white p-3 pr-6 z-50">
                <div className="space-y-6">
                  {section.options.map((option, optionIdx) => (
                      <div key={option.value} className="flex items-center">
                        <input
                            id={`filter-mobile-${section.id}-${optionIdx}`}
                            name={`${section.id}[]`}
                            defaultValue={option.value}
                            type="checkbox"
                            defaultChecked={option.checked}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label
                            htmlFor={`filter-mobile-${section.id}-${optionIdx}`}
                            className="ml-3 text-sm text-gray-500"
                        >
                          {option.label}
                        </label>
                      </div>
                  ))}
                </div>
              </Disclosure.Panel>
            </>
        )}
      </Disclosure>
  );
}
