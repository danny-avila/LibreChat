import React, { useEffect, useState } from 'react';

export const RestartingOverlay: React.FC = () => {
  const [seconds, setSeconds] = useState(3);

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          window.location.assign('/');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center space-y-4">
        <h1 className="text-2xl font-semibold text-green-600">Restarting LibreChat…</h1>
        <p className="text-lg text-gray-600">Redirecting in {seconds}…</p>
      </div>
    </div>
  );
}; 