import * as Ariakit from '@ariakit/react';
import { ReactNode, forwardRef, useEffect, useId, useRef } from 'react';
import type { ElementRef } from 'react';

export interface TabItem {
  id?: string;
  label: ReactNode;
  content: ReactNode;
  disabled?: boolean;
}

export interface AnimatedTabsProps {
  tabs: TabItem[];
  className?: string;
  tabListClassName?: string;
  tabClassName?: string;
  tabPanelClassName?: string;
  tabListProps?: Ariakit.TabListProps;
  defaultSelectedId?: string;
}

function usePrevious<T>(value: T) {
  const ref = useRef<T>();
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}

const Tab = forwardRef<ElementRef<typeof Ariakit.Tab>, Ariakit.TabProps>(function Tab(props, ref) {
  return (
    <Ariakit.Tab
      ref={ref}
      {...props}
      className={`data-[focus-visible]:outline-solid flex h-10 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border-none px-4 text-base outline-2 outline-offset-2 outline-blue-500 hover:bg-black/[0.075] active:pt-0.5 aria-disabled:opacity-50 aria-selected:bg-blue-500 aria-selected:text-white aria-selected:hover:bg-blue-600 data-[active]:pt-0.5 dark:hover:bg-white/10 dark:aria-selected:hover:bg-blue-600 ${props.className || ''}`}
    />
  );
});

const TabPanel = forwardRef<ElementRef<typeof Ariakit.TabPanel>, Ariakit.TabPanelProps>(
  function TabPanel(props, ref) {
    const tab = Ariakit.useTabContext();
    const defaultId = useId();
    const id = props.id ?? defaultId;
    const tabId = Ariakit.useStoreState(tab, () => props.tabId ?? tab?.panels.item(id)?.tabId);
    const previousTabId = usePrevious(Ariakit.useStoreState(tab, 'selectedId'));
    const wasOpen = tabId && previousTabId === tabId;

    return (
      <Ariakit.TabPanel
        ref={ref}
        id={id}
        tabId={tabId}
        {...props}
        data-was-open={wasOpen || undefined}
        className={`not-data-[open]:absolute not-data-[open]:top-0 w-96 max-w-full rounded-lg bg-white p-4 transition-[opacity,translate] duration-300 ease-in-out data-[open]:static data-[open]:top-0 data-[enter]:translate-x-0 data-[enter]:opacity-100 motion-reduce:transition-none dark:bg-slate-800 ${props.className || ''}`}
      />
    );
  },
);

export default function AnimatedTabs({
  tabs,
  className = '',
  tabListClassName = '',
  tabClassName = '',
  tabPanelClassName = '',
  tabListProps = {},
  defaultSelectedId,
}: AnimatedTabsProps) {
  // If no defaultSelectedId is provided, use the first tab
  const firstTabId = useId();
  const actualDefaultSelectedId = defaultSelectedId || firstTabId;

  return (
    <div className={`w-full ${className}`}>
      <Ariakit.TabProvider defaultSelectedId={actualDefaultSelectedId}>
        <Ariakit.TabList
          aria-label="Tabs"
          className={`flex gap-2 p-4 ${tabListClassName}`}
          {...tabListProps}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tab.id || index}
              id={tab.id || (index === 0 ? firstTabId : undefined)}
              disabled={tab.disabled}
              className={tabClassName}
            >
              {tab.label}
            </Tab>
          ))}
        </Ariakit.TabList>

        <div className="relative flex w-full flex-col items-center overflow-hidden p-0">
          {tabs.map((tab, index) => (
            <TabPanel
              key={tab.id || index}
              tabId={tab.id || (index === 0 ? firstTabId : undefined)}
              className={`group-has-[[data-was-open]]:translate-x-[-100%] group-has-[[data-was-open]]:opacity-0 [&:is([data-was-open],[data-open])~&]:translate-x-[100%] ${tabPanelClassName}`}
            >
              {tab.content}
            </TabPanel>
          ))}
        </div>
      </Ariakit.TabProvider>
    </div>
  );
}
