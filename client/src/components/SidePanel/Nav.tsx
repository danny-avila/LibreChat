import { useState } from 'react';
import * as AccordionPrimitive from '@radix-ui/react-accordion';
import type { NavLink, NavProps } from '~/common';
import { Accordion, AccordionItem, AccordionContent } from '~/components/ui/Accordion';
import { buttonVariants } from '~/components/ui/Button';
import { cn, removeFocusOutlines } from '~/utils';
import { TooltipAnchor } from '~/components/ui';
import { useLocalize } from '~/hooks';

export default function Nav({ links, isCollapsed, resize, defaultActive }: NavProps) {
  const localize = useLocalize();
  const [active, _setActive] = useState<string | undefined>(defaultActive);
  const getVariant = (link: NavLink) => (link.id === active ? 'default' : 'ghost');

  const setActive = (id: string) => {
    localStorage.setItem('side:active-panel', id + '');
    _setActive(id);
  };

  return (
    <div
      data-collapsed={isCollapsed}
      className="bg-token-sidebar-surface-primary hide-scrollbar group flex-shrink-0 overflow-x-hidden py-2 data-[collapsed=true]:py-2"
    >
      <div className="h-full">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-full min-h-0 flex-col opacity-100 transition-opacity">
            <div className="scrollbar-trigger relative h-full w-full flex-1 items-start border-white/20">
              <div className="flex h-full w-full flex-col gap-1 px-3 pb-3.5 group-[[data-collapsed=true]]:items-center group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                {links.map((link, index) => {
                  const variant = getVariant(link);
                  return isCollapsed ? (
                    <TooltipAnchor
                      className={cn(
                        buttonVariants({ variant, size: 'icon' }),
                        removeFocusOutlines,
                        'h-9 w-9',
                        variant === 'default'
                          ? 'dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted bg-surface-terniary dark:hover:text-white'
                          : '',
                      )}
                      onClick={(e) => {
                        if (link.onClick) {
                          link.onClick(e);
                          setActive('');
                          return;
                        }
                        setActive(link.id);
                        resize && resize(25);
                      }}
                      description={localize(link.title)}
                      side="left"
                    >
                      <link.icon className="h-4 w-4" />
                      <span className="sr-only">{link.title}</span>
                    </TooltipAnchor>
                  ) : (
                    <Accordion
                      key={index}
                      type="single"
                      value={active}
                      onValueChange={setActive}
                      collapsible
                    >
                      <AccordionItem value={link.id} className="w-full border-none">
                        <AccordionPrimitive.Header asChild>
                          <AccordionPrimitive.Trigger asChild>
                            <button
                              className={cn(
                                buttonVariants({ variant, size: 'sm' }),
                                removeFocusOutlines,
                                variant === 'default'
                                  ? 'dark:bg-muted dark:hover:bg-muted dark:text-white dark:hover:text-white'
                                  : '',
                                'hover:bg-gray-200 data-[state=open]:bg-gray-200 data-[state=open]:text-black dark:hover:bg-gray-700 dark:data-[state=open]:bg-gray-700 dark:data-[state=open]:text-white',
                                'w-full justify-start rounded-md border dark:border-gray-700',
                              )}
                              onClick={(e) => {
                                if (link.onClick) {
                                  link.onClick(e);
                                  setActive('');
                                }
                              }}
                            >
                              <link.icon className="mr-2 h-4 w-4" />
                              {localize(link.title)}
                              {link.label && (
                                <span
                                  className={cn(
                                    'ml-auto transition-all duration-300 ease-in-out',
                                    variant === 'default' ? 'text-background dark:text-white' : '',
                                    isCollapsed ? 'opacity-0' : 'opacity-100',
                                  )}
                                >
                                  {link.label}
                                </span>
                              )}
                            </button>
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>

                        <AccordionContent className="w-full dark:text-white">
                          {link.Component && <link.Component />}
                        </AccordionContent>
                      </AccordionItem>
                    </Accordion>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
