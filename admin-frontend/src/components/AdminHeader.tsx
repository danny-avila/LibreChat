import React from 'react';
import { LayoutDashboard, Menu } from 'lucide-react';

interface AdminHeaderProps {
  restarting: boolean;
  dirty: boolean;
  onApplyChanges: () => void;
  onHome: () => void;
  onToggleSidebar?: () => void;
}

export const AdminHeader: React.FC<AdminHeaderProps> = ({ restarting, dirty, onApplyChanges, onHome, onToggleSidebar }) => {
  return (
    <div className="flex items-center justify-between bg-white border-b border-gray-200 px-6 py-3 shadow-sm z-20">
      <div className="flex items-center">
        {/* Mobile Menu Button */}
        {onToggleSidebar && (
          <button
            onClick={onToggleSidebar}
            className="mr-3 p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors md:hidden"
            aria-label="Toggle sidebar"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        
        <h1 className="flex items-center text-xl font-medium m-0">
          <LayoutDashboard className="w-5 h-5" />
          <span className="ml-2">Admin Panel</span>
        </h1>
      </div>

      {/* Right side buttons */}
      <div className="flex items-center space-x-4">
        {/* Home button */}
        <button
          onClick={onHome}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition-colors"
        >
          Home
        </button>

        {/* Apply & Reload */}
        <button
          onClick={onApplyChanges}
          disabled={!dirty || restarting}
          className={`
          relative px-6 py-3 bg-green-500 text-white border-0 rounded-md text-sm font-medium
          transition-all duration-200
          ${(!dirty || restarting)
            ? 'cursor-not-allowed opacity-60'
            : 'cursor-pointer hover:bg-green-600 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2'}
        `}
        >
          {restarting ? 'Applying…' : 'Apply & Reload'}

          {dirty && !restarting && (
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}; 