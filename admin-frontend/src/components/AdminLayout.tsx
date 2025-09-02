import React, { useRef, useState, useMemo, useEffect } from 'react';
import { SETTING_GROUPS } from '../constants';
import UsersSection from './UsersSection';
import { useIntersectionObserver, useScrollNavigation } from '../hooks';
import { AdminHeader, SettingsSection } from './';
import Sidebar from './Sidebar';

interface AdminLayoutProps {
  values: Record<string, unknown>;
  saving: boolean; // currently unused but kept for potential future disable states
  restarting: boolean;
  dirty: boolean;
  onUpdateSetting: (key: string, value: unknown) => void;
  onApplyChanges: () => void;
  onHome: () => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
  values,
  saving,
  restarting,
  dirty,
  onUpdateSetting,
  onApplyChanges,
  onHome,
}) => {
  const [activeGroupId, setActiveGroupId] = useState<string>(SETTING_GROUPS[0].id);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isScrollingProgrammatically = useRef<boolean>(false);

  const sectionIds = useMemo(() => SETTING_GROUPS.map((group) => group.id), []);

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useIntersectionObserver({
    containerRef: scrollContainerRef,
    onSectionChange: setActiveGroupId,
    isProgrammaticScroll: isScrollingProgrammatically,
    sectionIds,
  });

  const { scrollToSection } = useScrollNavigation({
    containerRef: scrollContainerRef,
    onSectionChange: setActiveGroupId,
    isProgrammaticScroll: isScrollingProgrammatically,
  });

  const toggleSidebar = () => {
    setIsSidebarOpen(prev => !prev);
  };

  return (
    <div className="font-sans h-screen overflow-hidden flex flex-col">
      <AdminHeader 
        restarting={restarting}
        dirty={dirty}
        onHome={onHome}
        onApplyChanges={onApplyChanges}
        onToggleSidebar={isMobile ? toggleSidebar : undefined}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          active={activeGroupId} 
          onSelect={scrollToSection}
          isOpen={isMobile ? isSidebarOpen : true}
          onToggle={isMobile ? toggleSidebar : undefined}
        />

        <main
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto h-full flex justify-center"
        >
          <div className="w-full max-w-3xl p-8 min-w-80">
            {SETTING_GROUPS.map((group) => {
              if (group.id === 'users') {
                return (
                  <UsersSection
                    key={group.id}
                    values={values}
                    saving={saving}
                    onUpdateSetting={onUpdateSetting}
                  />
                );
              }
              return (
                <SettingsSection
                  key={group.id}
                  group={group}
                  values={values}
                  saving={saving}
                  onUpdateSetting={onUpdateSetting}
                />
              );
            })}

            <div className="h-20" />
          </div>
        </main>
      </div>
    </div>
  );
}; 