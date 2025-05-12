import * as Ariakit from '@ariakit/react';
import { ReactNode, forwardRef, useEffect, useRef, createRef } from 'react';
import type { ElementRef } from 'react';
import './AnimatedTabs.css';

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
      className={`animated-tab data-[focus-visible]:outline-solid flex h-10 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full border-none px-4 text-base outline-2 outline-offset-2 outline-blue-500 hover:bg-black/[0.075] active:pt-0.5 aria-disabled:opacity-50 aria-selected:bg-blue-500 aria-selected:text-white aria-selected:hover:bg-blue-600 data-[active]:pt-0.5 dark:hover:bg-white/10 dark:aria-selected:hover:bg-blue-600 ${props.className || ''}`}
    />
  );
});

const TabPanel = forwardRef<ElementRef<typeof Ariakit.TabPanel>, Ariakit.TabPanelProps>(
  function TabPanel(props, ref) {
    const tab = Ariakit.useTabContext();
    const previousTabId = usePrevious(Ariakit.useStoreState(tab, 'selectedId'));
    const wasOpen = props.tabId && previousTabId === props.tabId;

    return (
      <Ariakit.TabPanel
        ref={ref}
        {...props}
        data-was-open={wasOpen || undefined}
        className={`animated-tab-panel w-96 max-w-full rounded-lg bg-white p-4 dark:bg-slate-800 ${props.className || ''}`}
      />
    );
  },
);

export function AnimatedTabs({
  tabs,
  className = '',
  tabListClassName = '',
  tabClassName = '',
  tabPanelClassName = '',
  tabListProps = {},
  defaultSelectedId,
}: AnimatedTabsProps) {
  // Instead of using useId, we'll create stable IDs based on array indices
  // This avoids any hook rules issues completely
  const tabIds = tabs.map((tab, index) => tab.id || `tab-${index}`);
  const firstTabId = defaultSelectedId || tabIds[0];

  return (
    <div className={`w-full ${className}`}>
      <Ariakit.TabProvider defaultSelectedId={firstTabId}>
        <Ariakit.TabList
          aria-label="Tabs"
          className={`flex gap-2 p-4 ${tabListClassName}`}
          {...tabListProps}
        >
          {tabs.map((tab, index) => (
            <Tab
              key={tabIds[index]}
              id={tabIds[index]}
              disabled={tab.disabled}
              className={tabClassName}
            >
              {tab.label}
            </Tab>
          ))}
        </Ariakit.TabList>

        <div className="animated-panels relative flex w-full flex-col items-center overflow-hidden p-0">
          {tabs.map((tab, index) => (
            <TabPanel
              key={`panel-${tabIds[index]}`}
              id={`panel-${tabIds[index]}`}
              tabId={tabIds[index]}
              className={tabPanelClassName}
            >
              {tab.content}
            </TabPanel>
          ))}
        </div>
      </Ariakit.TabProvider>
    </div>
  );
}
