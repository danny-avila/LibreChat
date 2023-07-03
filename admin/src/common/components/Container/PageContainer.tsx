import React from 'react';

function PageContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-96 w-full rounded border border-gray-200 bg-white p-4 dark:border-gray-950 dark:bg-gray-700">
      {children}
    </div>
  );
}

export default PageContainer;
