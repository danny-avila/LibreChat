import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { useRecoilState } from 'recoil';
import store from '~/store';
import WorkflowBrowserPanel from './WorkflowBrowserPanel';
import WorkflowChatPanel from './WorkflowChatPanel';

export default function WorkflowLayout() {
  const [, setSidebarExpanded] = useRecoilState(store.sidebarExpanded);

  // Collapse the LibreChat sidebar so the 3-column layout has full width
  useEffect(() => {
    setSidebarExpanded(false);
  }, [setSidebarExpanded]);

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      <WorkflowBrowserPanel />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Outlet />
      </div>
      <WorkflowChatPanel />
    </div>
  );
}
