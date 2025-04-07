import * as AccordionPrimitive from '@radix-ui/react-accordion';
import { useState } from 'react';
import type { NavLink, NavProps } from '~/common';
import { Button, TooltipAnchor } from '~/components';
import { Accordion, AccordionContent, AccordionItem } from '~/components/ui/Accordion';
import { useLocalize } from '~/hooks';
import { cn } from '~/utils';

export default function Nav({ links, isCollapsed, resize, defaultActive }: NavProps) {
  const localize = useLocalize();
  const [active, _setActive] = useState<string | undefined>(defaultActive);
  // const [navVisible, setNavVisible] = useState<boolean>(true);
  const getVariant = (link: NavLink) => (link.id === active ? 'default' : 'ghost');

  const setActive = (id: string) => {
    localStorage.setItem('side:active-panel', id + '');
    _setActive(id);
  };

  // const toggleNavVisible = () => {
  //   setNavVisible((prev) => {
  //     const next = !prev;
  //     document.body.dataset.navVisible = next ? 'true' : 'false';
  //     localStorage.setItem('navVisible', JSON.stringify(next));
  //     return next;
  //   });
  //     localStorage.setItem('navVisible', JSON.stringify(!prev));
  //     return !prev;
  //   });
  // };

  return (
    <div
      data-collapsed={isCollapsed}
      className="bg-token-sidebar-surface-primary hide-scrollbar group flex-shrink-0 overflow-x-hidden"
    >
      <div className="h-full">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex h-full min-h-0 flex-col opacity-100 transition-opacity">
            <div className="scrollbar-trigger relative h-full w-full flex-1 items-start border-white/20">
              <div className="flex h-full w-full flex-col gap-1 px-3 py-2.5 group-[[data-collapsed=true]]:items-center group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
                {links.map((link, index) => {
                  const variant = getVariant(link);
                  return isCollapsed ? (
                    <TooltipAnchor
                      side="left"
                      key={`nav-link-${index}`}
                      render={
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            if (link.onClick) {
                              link.onClick(e);
                              setActive('');
                              return;
                            }
                            setActive(link.id);
                            resize && resize(25);
                          }}
                        >
                          <link.icon className="h-4 w-4 text-text-secondary" />
                          <span className="sr-only">{localize(link.title)}</span>
                        </Button>
                      }
                    />
                  ) : (
                    <Accordion
                      key={index}
                      type="single"
                      value="agents"
                      onValueChange={setActive}
                    >
                      <AccordionItem value={link.id} className="w-full border-none">
                        <AccordionPrimitive.Header asChild>
                          <AccordionPrimitive.Trigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="cursor-default border-none w-full justify-start bg-transparent text-text-primary  data-[state=open]:text-text-primary"
                              onClick={(e) => {
                                // toggleNavVisible();
                                // if (link.onClick) {
                                //   link.onClick(e);
                                //   setActive('');
                                // }
                              }}
                            >
                              {/* <link.icon className="mr-2 h-4 w-4" /> */}
                              {localize(link.title)}
                              {link.label != null && link.label && (
                                <span
                                  className={cn(
                                    'ml-auto opacity-100 transition-all duration-300 ease-in-out',
                                    variant === 'default' ? 'text-text-primary' : '',
                                  )}
                                >
                                  {link.label}
                                </span>
                              )}
                            </Button>
                          </AccordionPrimitive.Trigger>
                        </AccordionPrimitive.Header>

                        <AccordionContent className="w-full text-text-primary">
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
