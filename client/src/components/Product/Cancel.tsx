import React from 'react';
import { useNavigate } from 'react-router-dom';

export default function ProductCancel() {
  const navigate = useNavigate();
  return (
    <div className="max-w-md mx-auto text-center p-6">
      <h1 className="text-lg font-medium leading-6 text-text-primary">Purchase Canceled</h1>
      <p className="my-4 text-center text-sm font-light text-gray-700 dark:text-white">Your payment was canceled. No changes have been made.</p>
      <button className="rounded-full border-none bg-transparent p-2 hover:bg-surface-hover md:rounded-xl"
       onClick={() => navigate('/')}>Home</button>
    </div>
  );
}
