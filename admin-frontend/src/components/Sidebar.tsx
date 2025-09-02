import React from 'react';
import { SETTING_GROUPS } from '../constants';

interface SidebarProps {
  active: string;
  onSelect: (id: string) => void;
  isOpen?: boolean;
  onToggle?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  active, 
  onSelect, 
  isOpen = true, 
  onToggle 
}) => {
  const handleSectionSelect = (id: string) => {
    onSelect(id);
    // Auto-close on mobile after selection
    if (window.innerWidth < 768 && onToggle) {
      onToggle();
    }
  };

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`
          fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-200 md:hidden
          ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
        `}
        onClick={onToggle}
      />

      {/* Sidebar */}
      <aside className={`
        w-80 border-r border-gray-200 p-6 h-full overflow-y-auto bg-gray-50
        md:relative md:translate-x-0
        fixed top-0 left-0 z-50 transform transition-transform duration-200 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Mobile Header */}
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-200 md:hidden">
          <h2 className="text-lg font-semibold text-gray-700">
            Admin Settings
          </h2>
          <button
            onClick={onToggle}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            aria-label="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="space-y-1">
          {/* User Management subheader */}
          <h3 className="mt-4 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            User Management
          </h3>
          {SETTING_GROUPS.filter(g => g.id === 'users').map((group) => {
            const Icon = group.icon;
            const isActive = group.id === active;
            return (
              <button
                key={group.id}
                onClick={() => handleSectionSelect(group.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all duration-200
                  min-h-[44px] text-left
                  ${isActive 
                    ? 'bg-green-500 text-white' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  {group.title}
                </span>
                {isActive && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}

          {/* Settings subheader */}
          <h3 className="mt-6 mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Settings
          </h3>
          {SETTING_GROUPS.filter(g => g.id !== 'users').map((group) => {
            const Icon = group.icon;
            const isActive = group.id === active;
            return (
              <button
                key={group.id}
                onClick={() => handleSectionSelect(group.id)}
                className={`
                  w-full flex items-center gap-3 px-3 py-3 text-sm rounded-lg transition-all duration-200
                  min-h-[44px] text-left
                  ${isActive 
                    ? 'bg-green-500 text-white' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="flex-1 whitespace-nowrap overflow-hidden text-ellipsis">
                  {group.title}
                </span>
                {isActive && (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
};

export default Sidebar; 