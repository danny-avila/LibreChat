import React from 'react';

interface QuickActionsProps {
  children?: React.ReactNode;
}

const QuickActions: React.FC<QuickActionsProps> = ({ children }) => (
  <div className="rounded-lg border border-border-light bg-surface-primary-alt p-6">
    <h3 className="mb-4 text-lg font-semibold text-text-primary">Quick Actions</h3>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{children}</div>
  </div>
);

export default QuickActions;
