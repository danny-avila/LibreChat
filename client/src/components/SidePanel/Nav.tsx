import { useState } from 'react';
import { LucideIcon } from 'lucide-react';

import { cn, removeFocusOutlines } from '~/utils';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '~/components/ui/Collapsible';
import { buttonVariants } from '~/components/ui/Button';
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/Tooltip';

type NavLink = {
  title: string;
  label?: string;
  icon: LucideIcon;
  Component?: React.ComponentType;
  variant?: 'default' | 'ghost';
  id: string;
};

interface NavProps {
  isCollapsed: boolean;
  links: NavLink[];
  resize?: (size: number) => void;
}

export default function Nav({ links, isCollapsed, resize }: NavProps) {
  const [active, setActive] = useState<string | null>(links[0].id);
  const getVariant = (link: NavLink) => (link.id === active ? 'default' : 'ghost');

  return (
    <div
      data-collapsed={isCollapsed}
      className="group flex flex-col gap-4 py-2 data-[collapsed=true]:py-2"
    >
      <nav className="grid gap-1 px-2 group-[[data-collapsed=true]]:justify-center group-[[data-collapsed=true]]:px-2">
        {links.map((link, index) => {
          const variant = getVariant(link);
          return isCollapsed ? (
            <Tooltip key={index} delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    buttonVariants({ variant, size: 'icon' }),
                    removeFocusOutlines,
                    'h-9 w-9',
                    variant === 'default'
                      ? 'dark:bg-muted dark:text-muted-foreground dark:hover:bg-muted dark:hover:text-white'
                      : '',
                  )}
                  onClick={() => {
                    setActive(link.id);
                    resize && resize(25);
                  }}
                >
                  <link.icon className="h-4 w-4" />
                  <span className="sr-only">{link.title}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="flex items-center gap-4">
                {link.title}
                {link.label && <span className="text-muted-foreground ml-auto">{link.label}</span>}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Collapsible
              open={active === link.id}
              key={index}
              onOpenChange={(open) => !open && setActive(null)}
            >
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    buttonVariants({ variant, size: 'sm' }),
                    removeFocusOutlines,
                    variant === 'default'
                      ? 'dark:bg-muted dark:hover:bg-muted dark:text-white dark:hover:text-white'
                      : '',
                    'data-[state=open]:bg-gray-900 data-[state=open]:text-white dark:data-[state=open]:bg-gray-800',
                    'w-full justify-start',
                  )}
                  onClick={() => setActive(link.id)}
                >
                  <link.icon className="mr-2 h-4 w-4" />
                  {link.title}
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
              </CollapsibleTrigger>
              <CollapsibleContent className="w-full dark:text-white">
                {link.Component && <link.Component />}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>
    </div>
  );
}
